// background.js

// Object to store tag-to-color mapping for static menu items.
const menuMapping = {};

// Recursively create context menu items from the given menu object.
function createContextMenuItems(menuObj, parentId = null) {
  for (const key in menuObj) {
    if (menuObj.hasOwnProperty(key)) {
      const item = menuObj[key];

      // Create the base (non-variant) menu item.
      chrome.contextMenus.create({
        id: item.data_tag,
        title: item.label,
        contexts: ["selection"],
        parentId: parentId,
        type: "normal"
      });
      menuMapping[item.data_tag] = item.data_color || "yellow";

      // If the item has a submenu, process it recursively.
      if (item.submenu) {
        createContextMenuItems(item.submenu, item.data_tag);
      }

      // If the item supports dynamic entity assignment (i.e. has variants),
      // add an extra submenu item to let the user assign subject and target.
      if (item.variant && item.variant.length > 0) {
        chrome.contextMenus.create({
          id: item.data_tag + "_assign",
          title: "Assign Entities...",
          contexts: ["selection"],
          parentId: item.data_tag,
          type: "normal"
        });
        menuMapping[item.data_tag + "_assign"] = item.data_color || "yellow";
      }
    }
  }
}

// Load the menu JSON file and create the static context menus.
fetch(chrome.runtime.getURL('menu.json'))
  .then(response => response.json())
  .then(menu => {
    createContextMenuItems(menu);
  })
  .catch(err => console.error('Error loading menu.json:', err));

/* ---------------------------
   Dynamic Entity Labeling Menu
   ---------------------------
   This creates a parent "Entity Labeling" menu that lists stored entities.
*/
function createDynamicEntityMenuItems(entities) {
  console.log("Creating dynamic entity menu for:", entities);
  const parentId = "entity_labeling";
  chrome.contextMenus.create({
    id: parentId,
    title: "Entity Labeling",
    contexts: ["selection"],
    type: "normal"
  });
  entities.forEach(entity => {
    const id = `Label_entity_${entity.name}`;
    chrome.contextMenus.create({
      id: id,
      title: `${entity.name} (${entity.type})`,
      contexts: ["selection"],
      parentId: parentId,
      type: "normal"
    });
    // Set a default color for dynamic entity labels.
    menuMapping[id] = "#D1E8FF";
  });
}

// Initialize the dynamic entity menu from storage.
chrome.storage.sync.get("entities", (result) => {
  const entities = result.entities || [];
  if (entities.length > 0) {
    createDynamicEntityMenuItems(entities);
  }
});

// Listen for storage changes to update the dynamic entity menu.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.entities) {
    // Remove the existing dynamic entity menu.
    chrome.contextMenus.remove("entity_labeling", () => {
      const newEntities = changes.entities.newValue || [];
      if (newEntities.length > 0) {
        createDynamicEntityMenuItems(newEntities);
      }
    });
  }
});

// Listen for context menu clicks.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const id = info.menuItemId;
  
  if (id.endsWith("_assign")) {
    // "Assign Entities..." was clicked.
    // Remove the "_assign" suffix to obtain the base tag.
    const baseTag = id.replace("_assign", "");
    chrome.tabs.sendMessage(tab.id, { action: "assignEntities", tag: baseTag });
  } else if (id.startsWith("Label_entity_")) {
    // A dynamic entity labeling menu item was clicked.
    // Retrieve the entity details from storage.
    chrome.storage.sync.get("entities", (result) => {
      const entities = result.entities || [];
      const entityName = id.replace("Label_entity_", "");
      const entity = entities.find(e => e.name === entityName);
      if (entity) {
        const bgColor = menuMapping[id] || "#D1E8FF";
        // Directly highlight the selection using the dynamic entity info.
        // Here we assign the entity as the subject (target left empty).
        chrome.tabs.sendMessage(tab.id, { 
          action: "highlightEntity", 
          tag: `${entity.name} (${entity.type})`, 
          bgColor: bgColor,
          subject: entity.name,
          target: ""
        });
      }
    });
  } else {
    // Otherwise, perform the standard highlight action.
    const bgColor = menuMapping[id] || "yellow";
    chrome.tabs.sendMessage(tab.id, { action: "highlight", tag: id, bgColor: bgColor });
  }
});
