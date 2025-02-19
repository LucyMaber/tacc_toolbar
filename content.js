(() => {
  let savedRange = null;

  // Update savedRange whenever the selection changes.
  function updateSavedRange() {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      savedRange = selection.getRangeAt(0).cloneRange();
    }
  }
  document.addEventListener("mouseup", updateSavedRange);
  document.addEventListener("selectionchange", updateSavedRange);

  // Helper to compute a simple DOM path (CSS-like selector) for an element.
  function getDomPath(el) {
    if (!el) return "";
    const stack = [];
    while (el.parentNode && el.nodeType === Node.ELEMENT_NODE) {
      let sibCount = 0;
      let sibIndex = 0;
      for (let i = 0; i < el.parentNode.childNodes.length; i++) {
        const sib = el.parentNode.childNodes[i];
        if (sib.nodeType === Node.ELEMENT_NODE && sib.tagName === el.tagName) {
          if (sib === el) {
            sibIndex = sibCount;
          }
          sibCount++;
        }
      }
      let nodeSelector = el.tagName.toLowerCase();
      if (sibCount > 1) {
        nodeSelector += `:nth-of-type(${sibIndex + 1})`;
      }
      stack.unshift(nodeSelector);
      el = el.parentNode;
    }
    return stack.join(" > ");
  }

  // Function to wrap the selected range with a span for highlighting.
  const highlightRange = (range, tag, bgColor, extraAttributes = {}) => {
    if (!range || range.collapsed) {
      console.warn("No valid range to highlight.");
      return;
    }
    const span = document.createElement("span");
    span.style.backgroundColor = bgColor;
    span.setAttribute("data-tag", tag);
    span.setAttribute("data-timestamp", new Date().toISOString());
    
    // Set any extra attributes (for entity highlights, etc.)
    Object.keys(extraAttributes).forEach(attr => {
      span.setAttribute(attr, extraAttributes[attr]);
    });
    
    // Capture contextual text.
    let contextText = "";
    const para = range.startContainer.parentElement && range.startContainer.parentElement.closest("p");
    if (para) {
      contextText = para.innerText.trim();
    } else if (range.startContainer.parentElement) {
      contextText = range.startContainer.parentElement.innerText.trim();
    }
    span.setAttribute("data-context", contextText);

    // Determine location (e.g. headline, body, or other element).
    let locationInfo = "";
    if (range.startContainer.nodeType === Node.TEXT_NODE && range.startContainer.parentElement) {
      const parentTag = range.startContainer.parentElement.tagName.toLowerCase();
      locationInfo = ["h1", "h2", "h3"].includes(parentTag)
        ? "headline"
        : (parentTag === "p" ? "body" : parentTag);
    }
    span.setAttribute("data-location", locationInfo);

    // Save selection offsets.
    span.setAttribute("data-startOffset", range.startOffset);
    span.setAttribute("data-endOffset", range.endOffset);

    // Construct tooltip text from the metadata.
    let tooltipText = `Tag: ${tag}`;
    if (extraAttributes["data-entity"] === "true") {
      tooltipText += `\nSubject: ${extraAttributes["data-subject"] || "none"} (${extraAttributes["data-subject-type"] || "none"})`;
      tooltipText += `\nTarget: ${extraAttributes["data-target"] || "none"} (${extraAttributes["data-target-type"] || "none"})`;
    }
    if (extraAttributes["data-description"]) {
      tooltipText += `\nDescription: ${extraAttributes["data-description"]}`;
    }
    span.title = tooltipText;

    try {
      range.surroundContents(span);
      console.log("Text highlighted using surroundContents.");
    } catch (err) {
      console.warn("surroundContents failed, falling back:", err);
      try {
        const content = range.extractContents();
        span.appendChild(content);
        range.insertNode(span);
        console.log("Text highlighted using fallback method.");
      } catch (fallbackErr) {
        console.error("Fallback highlighting method failed:", fallbackErr);
      }
    }
  };

  // Listen for messages from background/popup scripts.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    let range = null;
    const selection = window.getSelection();
    if (selection && selection.rangeCount && !selection.isCollapsed) {
      range = selection.getRangeAt(0);
    } else if (savedRange && !savedRange.collapsed) {
      range = savedRange;
    }

    if (message.action === "highlight") {
      // Use the provided color from the message (from menu.json)
      const { tag, bgColor } = message;
      highlightRange(range, tag, bgColor || "#D1E8FF");
      if (selection) selection.removeAllRanges();
      sendResponse({ status: "highlighted" });
      
    } else if (message.action === "assignEntities") {
      // Use our enhanced modal which reuses stored entities.
      createEntityAssignmentModal(message.tag, message.bgColor, (subjectName, subjectType, targetName, targetType, description) => {
        // Use the bgColor provided by the menu item; fallback if none.
        const entityBgColor = message.bgColor || "#D1E8FF";
        const tagWithEntities = `${message.tag} [subject: ${subjectName || "none"} (${subjectType || "none"}), target: ${targetName || "none"} (${targetType || "none"})]`;
        highlightRange(range, tagWithEntities, entityBgColor, {
          "data-entity": "true",
          "data-subject": subjectName || "",
          "data-subject-type": subjectType || "",
          "data-target": targetName || "",
          "data-target-type": targetType || "",
          "data-description": description || ""
        });
        if (selection) selection.removeAllRanges();
        sendResponse({ status: "entity highlighted" });
      });
      
    } else if (message.action === "getHighlights") {
      // Gather all highlights on the page.
      const highlights = document.querySelectorAll("span[data-tag]");
      const info = Array.from(highlights).map(el => ({
        tag: el.getAttribute("data-tag"),
        text: el.innerText.trim(),
        bgColor: el.style.backgroundColor,
        timestamp: el.getAttribute("data-timestamp"),
        context: el.getAttribute("data-context"),
        location: el.getAttribute("data-location"),
        startOffset: el.getAttribute("data-startOffset"),
        endOffset: el.getAttribute("data-endOffset"),
        domPath: getDomPath(el),
        subject: el.getAttribute("data-subject") || "",
        target: el.getAttribute("data-target") || "",
        description: el.getAttribute("data-description") || ""
      }));
      sendResponse(info);
      
    } else if (message.action === "clearHighlights") {
      // Remove all highlight spans.
      const highlights = document.querySelectorAll("span[data-tag]");
      highlights.forEach(el => {
        const parent = el.parentNode;
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, el);
        }
        parent.removeChild(el);
      });
      sendResponse({ status: "cleared" });
      
    } else if (message.action === "reapplyHighlight") {
      const { highlight } = message;
      if (highlight.text) {
        const regex = new RegExp(highlight.text);
        document.body.innerHTML = document.body.innerHTML.replace(regex, (match) => {
          return `<span style="background-color:${highlight.bgColor || 'yellow'}" data-tag="${highlight.tag}" data-timestamp="${highlight.timestamp}" data-context="${highlight.context}" data-location="${highlight.location}" data-startOffset="${highlight.startOffset}" data-endOffset="${highlight.endOffset}" data-subject="${highlight.subject || ''}" data-target="${highlight.target || ''}" data-description="${highlight.description || ''}" data-domPath="${highlight.domPath}" title="Tag: ${highlight.tag}\nDescription: ${highlight.description || ''}">${match}</span>`;
        });
      }
      sendResponse({ status: "reapplied" });
    }
    return true;
  });

  // Create an enhanced modal for entity assignment using stored entities.
  // Now accepts the bgColor to use if needed.
  function createEntityAssignmentModal(tag, bgColor, callback) {
    // Create overlay.
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '9999';

    // Create modal container.
    const modal = document.createElement('div');
    modal.style.backgroundColor = 'white';
    modal.style.padding = '20px';
    modal.style.borderRadius = '5px';
    modal.style.width = '320px';
    modal.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    
    // Modal HTML now includes fields for "Other" values and a description.
    modal.innerHTML = `
      <h3>Assign Entities</h3>
      <div>
        <label>Subject:</label><br/>
        <select id="subjectDropdown" style="width:100%;">
          <option value="None">None</option>
        </select>
        <!-- When "Other" is selected, show these fields -->
        <input type="text" id="subjectOther" placeholder="Enter new subject" style="width:100%; display:none; margin-top:5px;"/>
        <select id="subjectTypeOther" style="width:100%; display:none; margin-top:5px;">
          <option value="">Select type</option>
          <option value="Person">Person</option>
          <option value="Organization">Organization</option>
          <option value="Location">Location</option>
          <option value="Event">Event</option>
        </select>
      </div>
      <br/>
      <div>
        <label>Target:</label><br/>
        <select id="targetDropdown" style="width:100%;">
          <option value="None">None</option>
        </select>
        <!-- When "Other" is selected, show these fields -->
        <input type="text" id="targetOther" placeholder="Enter new target" style="width:100%; display:none; margin-top:5px;"/>
        <select id="targetTypeOther" style="width:100%; display:none; margin-top:5px;">
          <option value="">Select type</option>
          <option value="Person">Person</option>
          <option value="Organization">Organization</option>
          <option value="Location">Location</option>
          <option value="Event">Event</option>
        </select>
      </div>
      <br/>
      <div>
        <label>Description:</label><br/>
        <textarea id="descriptionInput" placeholder="Enter description" style="width:100%; margin-top:5px;"></textarea>
      </div>
      <br/>
      <button id="modalSubmit" style="margin-right:10px;">Submit</button>
      <button id="modalCancel">Cancel</button>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Populate dropdowns from storage.
    chrome.storage.sync.get("entities", (result) => {
      const entities = result.entities || [];
      populateDropdown(document.getElementById('subjectDropdown'), entities);
      populateDropdown(document.getElementById('targetDropdown'), entities);
    });

    // When a dropdown value changes, show/hide the "Other" inputs.
    const subjectDropdown = modal.querySelector('#subjectDropdown');
    const subjectOther = modal.querySelector('#subjectOther');
    const subjectTypeOther = modal.querySelector('#subjectTypeOther');
    subjectDropdown.addEventListener('change', (e) => {
      if (e.target.value === "Other") {
        subjectOther.style.display = "block";
        subjectTypeOther.style.display = "block";
      } else {
        subjectOther.style.display = "none";
        subjectTypeOther.style.display = "none";
      }
    });

    const targetDropdown = modal.querySelector('#targetDropdown');
    const targetOther = modal.querySelector('#targetOther');
    const targetTypeOther = modal.querySelector('#targetTypeOther');
    targetDropdown.addEventListener('change', (e) => {
      if (e.target.value === "Other") {
        targetOther.style.display = "block";
        targetTypeOther.style.display = "block";
      } else {
        targetOther.style.display = "none";
        targetTypeOther.style.display = "none";
      }
    });

    // Handle form submission.
    modal.querySelector('#modalSubmit').addEventListener('click', () => {
      // For subject.
      let subjectName = "";
      let subjectType = "";
      if (subjectDropdown.value === "None") {
        subjectName = "";
      } else if (subjectDropdown.value === "Other") {
        subjectName = subjectOther.value.trim();
        subjectType = subjectTypeOther.value;
      } else {
        // Option value stored as "Name|Type"
        const parts = subjectDropdown.value.split("|");
        subjectName = parts[0];
        subjectType = parts[1] || "";
      }

      // For target.
      let targetName = "";
      let targetType = "";
      if (targetDropdown.value === "None") {
        targetName = "";
      } else if (targetDropdown.value === "Other") {
        targetName = targetOther.value.trim();
        targetType = targetTypeOther.value;
      } else {
        const parts = targetDropdown.value.split("|");
        targetName = parts[0];
        targetType = parts[1] || "";
      }

      // Get description.
      const description = modal.querySelector('#descriptionInput').value.trim();

      // If new subject or target entered, add them to storage.
      addEntityIfNew(subjectName, subjectType);
      addEntityIfNew(targetName, targetType);
      document.body.removeChild(overlay);
      callback(subjectName, subjectType, targetName, targetType, description);
    });

    // Handle cancel.
    modal.querySelector('#modalCancel').addEventListener('click', () => {
      document.body.removeChild(overlay);
      callback("", "", "", "", "");
    });
  }

  // Populate a dropdown with entities from storage.
  function populateDropdown(dropdown, entities) {
    // The dropdown already has a "None" option.
    // Append existing entities.
    entities.forEach(entity => {
      const option = document.createElement("option");
      // Store both name and type separated by a delimiter.
      option.value = `${entity.name}|${entity.type}`;
      option.textContent = `${entity.name} (${entity.type})`;
      dropdown.appendChild(option);
    });
    // Add an "Other" option.
    const otherOption = document.createElement("option");
    otherOption.value = "Other";
    otherOption.textContent = "Other";
    dropdown.appendChild(otherOption);
  }

  // Add a new entity to storage if it doesn't exist already.
  function addEntityIfNew(name, type) {
    if (!name) return;
    chrome.storage.sync.get("entities", (result) => {
      let entities = result.entities || [];
      // Check if entity already exists (by name and type).
      if (!entities.some(e => e.name === name && e.type === type)) {
        entities.push({ name: name, type: type });
        chrome.storage.sync.set({ entities: entities }, () => {
          console.log("New entity added:", { name, type });
        });
      }
    });
  }
})();
