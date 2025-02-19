document.addEventListener('DOMContentLoaded', () => {
  // Tab elements
  const tabHighlights = document.getElementById('tab-highlights');
  const tabEntities = document.getElementById('tab-entities');
  const tabSettings = document.getElementById('tab-settings');
  const tabInstructions = document.getElementById('tab-instructions');
  const tabImport = document.getElementById('tab-import');

  // Content sections
  const highlightsSection = document.getElementById('highlightsSection');
  const entitiesSection = document.getElementById('entitiesSection');
  const settingsSection = document.getElementById('settingsSection');
  const instructionsSection = document.getElementById('instructionsSection');
  const importSection = document.getElementById('importSection');

  // Function to set the active tab and section.
  function setActiveTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    if (tab === 'highlights') {
      tabHighlights.classList.add('active');
      highlightsSection.classList.add('active');
    } else if (tab === 'entities') {
      tabEntities.classList.add('active');
      entitiesSection.classList.add('active');
    } else if (tab === 'settings') {
      tabSettings.classList.add('active');
      settingsSection.classList.add('active');
    } else if (tab === 'instructions') {
      tabInstructions.classList.add('active');
      instructionsSection.classList.add('active');
    } else if (tab === 'import') {
      tabImport.classList.add('active');
      importSection.classList.add('active');
    }
  }

  // Tab click event listeners.
  tabHighlights.addEventListener('click', () => setActiveTab('highlights'));
  tabEntities.addEventListener('click', () => setActiveTab('entities'));
  tabSettings.addEventListener('click', () => setActiveTab('settings'));
  tabInstructions.addEventListener('click', () => setActiveTab('instructions'));
  tabImport.addEventListener('click', () => setActiveTab('import'));

  // Build the highlights table and metadata.
  function buildTableAndMetadata(activeTab, highlights) {
    document.getElementById("metadata").innerHTML = `
      <strong>URL:</strong> ${activeTab.url} <br>
      <strong>Title:</strong> ${activeTab.title} <br>
      <strong>Export Time:</strong> ${new Date().toISOString()}
    `;
    
    const tbody = document.querySelector("#highlightTable tbody");
    tbody.innerHTML = "";
    
    if (highlights.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 8; // Match the table’s 8 columns.
      cell.textContent = "No highlights found.";
      row.appendChild(cell);
      tbody.appendChild(row);
    } else {
      highlights.forEach((highlight) => {
        const row = document.createElement("tr");
  
        // Tag
        const cellTag = document.createElement("td");
        cellTag.textContent = highlight.tag;
        row.appendChild(cellTag);
  
        // Highlighted Text
        const cellText = document.createElement("td");
        cellText.textContent = highlight.text;
        row.appendChild(cellText);
  
        // Timestamp
        const cellTimestamp = document.createElement("td");
        cellTimestamp.textContent = highlight.timestamp;
        row.appendChild(cellTimestamp);
  
        // Context (e.g., nearby paragraph)
        const cellContext = document.createElement("td");
        cellContext.textContent = highlight.context;
        row.appendChild(cellContext);
  
        // Location Information – DOM (the computed DOM path)
        const cellDom = document.createElement("td");
        cellDom.textContent = highlight.domPath;
        row.appendChild(cellDom);
  
        // Offsets (position reference)
        const cellOffsets = document.createElement("td");
        cellOffsets.textContent = `${highlight.startOffset} - ${highlight.endOffset}`;
        row.appendChild(cellOffsets);
  
        // User Identity
        const cellUser = document.createElement("td");
        cellUser.textContent = highlight.userIdentity || "";
        row.appendChild(cellUser);
  
        tbody.appendChild(row);
      });
    }
  }
  
  // Retrieve highlights from the active tab.
  function loadHighlights(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      // Check if the active tab is a valid webpage.
      if (activeTab.url.startsWith("chrome-extension://") || activeTab.url.startsWith("chrome://")) {
        document.getElementById("metadata").textContent = "No highlights available on this page.";
        return;
      }
      chrome.tabs.sendMessage(activeTab.id, { action: "getHighlights" }, (response) => {
        if (chrome.runtime.lastError) {
          document.getElementById("metadata").textContent =
            "Error retrieving highlights: " + chrome.runtime.lastError.message;
          return;
        }
        const highlights = response || [];
        buildTableAndMetadata(activeTab, highlights);
        if (typeof callback === "function") {
          callback(activeTab, highlights);
        }
      });
    });
  }
  
  // Export highlights as a JSON file.
  document.getElementById("exportButton").addEventListener("click", () => {
    loadHighlights((activeTab, highlights) => {
      // Retrieve the user identity from storage (or default to "Anonymous").
      chrome.storage.sync.get('userIdentity', (result) => {
        const userIdentity = result.userIdentity || 'Anonymous';
        // Add user identity to each highlight.
        const updatedHighlights = highlights.map(h => ({
          ...h,
          userIdentity: userIdentity
        }));
  
        const outputData = {
          url: activeTab.url,                      // Location Information – URL
          title: activeTab.title,                  // Location Information – Title
          exportTime: new Date().toISOString(),
          highlights: updatedHighlights
        };
  
        const blob = new Blob([JSON.stringify(outputData, null, 2)], { type: "application/json" });
        const urlBlob = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = urlBlob;
        a.download = "highlights.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(urlBlob);
  
        // Optionally remove highlights after export.
        chrome.tabs.sendMessage(activeTab.id, { action: "clearHighlights" });
      });
    });
  });
  
  // Send highlights to the TACC endpoint.
  document.getElementById("sendToTACCButton").addEventListener("click", () => {
    loadHighlights((activeTab, highlights) => {
      chrome.storage.sync.get('userIdentity', (result) => {
        const userIdentity = result.userIdentity || 'Anonymous';
        const updatedHighlights = highlights.map(h => ({
          ...h,
          userIdentity: userIdentity
        }));
  
        const outputData = {
          url: activeTab.url,
          title: activeTab.title,
          exportTime: new Date().toISOString(),
          highlights: updatedHighlights
        };
  
        const taccEndpoint = "https://example.com/tacc";
        fetch(taccEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(outputData),
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error("Network response was not ok");
            }
            return response.json();
          })
          .then((data) => {
            document.getElementById("metadata").innerHTML +=
              "<br><strong>TACC Response:</strong> " + JSON.stringify(data);
          })
          .catch((error) => {
            document.getElementById("metadata").innerHTML +=
              "<br><strong>Error sending to TACC:</strong> " + error.message;
          });
      });
    });
  });
  
  // =======================
  // Entities Section
  // =======================
  
  // Function to load entities from storage and update the entities table.
  function loadEntities() {
    chrome.storage.sync.get("entities", (result) => {
      const entities = result.entities || [];
      const tbody = document.querySelector("#entityTable tbody");
      tbody.innerHTML = "";
      entities.forEach((entity, index) => {
        const row = document.createElement("tr");
  
        const cellType = document.createElement("td");
        cellType.textContent = entity.type;
        row.appendChild(cellType);
  
        const cellName = document.createElement("td");
        cellName.textContent = entity.name;
        row.appendChild(cellName);
  
        // Create an action cell with a delete button.
        const cellAction = document.createElement("td");
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Delete";
        deleteBtn.style.backgroundColor = "#dc3545";
        deleteBtn.style.border = "none";
        deleteBtn.style.color = "white";
        deleteBtn.style.padding = "5px 10px";
        deleteBtn.style.borderRadius = "3px";
        deleteBtn.style.cursor = "pointer";
        deleteBtn.addEventListener("click", () => {
          // Remove this entity from the list and update storage.
          const updatedEntities = entities.filter((_, i) => i !== index);
          chrome.storage.sync.set({ entities: updatedEntities }, () => {
            loadEntities();
          });
        });
        cellAction.appendChild(deleteBtn);
        row.appendChild(cellAction);
  
        tbody.appendChild(row);
      });
    });
  }
  
  // Initially load the entities.
  loadEntities();
  
  // Add new entity on button click.
  document.getElementById("addEntityButton").addEventListener("click", () => {
    const entityName = document.getElementById("entityName").value.trim();
    const entityType = document.getElementById("entityType").value;
    if (!entityName || !entityType) {
      document.getElementById("entityMetadata").textContent = "Please provide both Entity Name and Entity Type.";
      return;
    }
    chrome.storage.sync.get("entities", (result) => {
      let entities = result.entities || [];
      entities.push({ name: entityName, type: entityType });
      chrome.storage.sync.set({ entities: entities }, () => {
        document.getElementById("entityMetadata").textContent = "Entity added successfully.";
        document.getElementById("entityName").value = "";
        document.getElementById("entityType").value = "";
        loadEntities();
      });
    });
  });
  
  // =======================
  // Import Section
  // =======================
  
  // Import highlights from JSON file.
  document.getElementById('importButton').addEventListener('click', () => {
    const fileInput = document.getElementById('importFile');
    const file = fileInput.files[0];
    if (!file) {
      document.getElementById('importStatus').textContent = "Please select a JSON file to import.";
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const importedData = JSON.parse(e.target.result);
        // Validate that the file has the expected structure.
        if (!importedData.highlights || !Array.isArray(importedData.highlights)) {
          document.getElementById('importStatus').textContent = "Invalid file format: Missing highlights array.";
          return;
        }
        const tbody = document.querySelector("#importHighlightTable tbody");
        tbody.innerHTML = "";
        importedData.highlights.forEach((highlight) => {
          const row = document.createElement("tr");
          
          // Original Tag
          const cellOriginalTag = document.createElement("td");
          cellOriginalTag.textContent = highlight.tag || "";
          row.appendChild(cellOriginalTag);
          
          // Edit Tag (input field for potential modifications)
          const cellEditTag = document.createElement("td");
          const inputEditTag = document.createElement("input");
          inputEditTag.type = "text";
          inputEditTag.value = highlight.tag || "";
          cellEditTag.appendChild(inputEditTag);
          row.appendChild(cellEditTag);
          
          // Text
          const cellText = document.createElement("td");
          cellText.textContent = highlight.text || "";
          row.appendChild(cellText);
          
          // Timestamp
          const cellTimestamp = document.createElement("td");
          cellTimestamp.textContent = highlight.timestamp || "";
          row.appendChild(cellTimestamp);
          
          // Context
          const cellContext = document.createElement("td");
          cellContext.textContent = highlight.context || "";
          row.appendChild(cellContext);
          
          // Location (DOM path)
          const cellDom = document.createElement("td");
          cellDom.textContent = highlight.domPath || "";
          row.appendChild(cellDom);
          
          // Offsets
          const cellOffsets = document.createElement("td");
          if (highlight.startOffset !== undefined && highlight.endOffset !== undefined) {
            cellOffsets.textContent = `${highlight.startOffset} - ${highlight.endOffset}`;
          }
          row.appendChild(cellOffsets);
          
          // User Identity
          const cellUser = document.createElement("td");
          cellUser.textContent = highlight.userIdentity || "";
          row.appendChild(cellUser);
          
          tbody.appendChild(row);
        });
        document.getElementById('importStatus').textContent = "Highlights imported successfully.";
        
        // Reapply the highlights on the active page.
        reapplyHighlights(importedData.highlights);
        
      } catch (error) {
        document.getElementById('importStatus').textContent = "Error parsing JSON file: " + error.message;
      }
    };
    reader.readAsText(file);
  });
  
  // Function to reapply highlights to the active tab/page.
  function reapplyHighlights(highlights) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      // First, clear any existing highlights.
      chrome.tabs.sendMessage(activeTab.id, { action: "clearHighlights" }, () => {
        // Then, send each highlight to the content script to reapply.
        highlights.forEach((highlight) => {
          chrome.tabs.sendMessage(activeTab.id, { 
            action: "reapplyHighlight",
            highlight: highlight 
          });
        });
      });
    });
  }
  
  // Automatically load highlights when the popup opens.
  loadHighlights();
});
