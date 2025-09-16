// ==UserScript==
// @name         Civicomfy companion
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Little companion script to add one-click download buttons to civitai
// @author       You
// @match        https://civitai.com/models/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=civitai.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  "use strict";

  /** Default settings **/
  const DEFAULT_SETTINGS = {
    comfyUrl: "http://127.0.0.1:8188",
    apiKey: "",
    modelType: "loras",
    customDownloadPath: "{base_model}/{model_category}",
    numConnections: 1,
    forceRedownload: false
  };

  /** Get settings with defaults **/
  function getSettings() {
    const settings = {};
    for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
      settings[key] = GM_getValue(key, defaultValue);
    }
    return settings;
  }

  /** Save settings **/
  function saveSettings(settings) {
    for (const [key, value] of Object.entries(settings)) {
      GM_setValue(key, value);
    }
  }

  /** Fetch model types from ComfyUI API **/
  function fetchModelTypes(comfyUrl) {
    return new Promise((resolve, reject) => {
      // Check cache first (valid for 5 minutes)
      const cacheKey = `modelTypes_${comfyUrl}`;
      const cacheTimeKey = `modelTypesTime_${comfyUrl}`;
      const cachedTypes = GM_getValue(cacheKey, null);
      const cacheTime = GM_getValue(cacheTimeKey, 0);
      const now = Date.now();

      // Return cached data if it's fresh (less than 5 minutes old)
      if (cachedTypes && (now - cacheTime) < 5 * 60 * 1000) {
        resolve(JSON.parse(cachedTypes));
        return;
      }

      GM_xmlhttpRequest({
        method: "GET",
        url: `${comfyUrl}/api/civitai/model_types`,
        onload: (response) => {
          try {
            if (response.status === 200) {
              const modelTypes = JSON.parse(response.responseText);
              // Cache the results
              GM_setValue(cacheKey, JSON.stringify(modelTypes));
              GM_setValue(cacheTimeKey, now);
              resolve(modelTypes);
            } else {
              reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
            }
          } catch (err) {
            reject(new Error(`Failed to parse response: ${err.message}`));
          }
        },
        onerror: (err) => {
          reject(new Error(`Network error: ${err.error || "unknown"}`));
        },
        ontimeout: () => {
          reject(new Error("Request timeout"));
        },
        timeout: 10000 // 10 second timeout
      });
    });
  }

  /** Create and show settings modal **/
  function showSettingsModal() {
    // Remove existing modal if any
    const existingModal = document.querySelector("#comfy-settings-modal");
    if (existingModal) {
      existingModal.remove();
    }

    const settings = getSettings();

    // Create modal overlay
    const overlay = document.createElement("div");
    overlay.id = "comfy-settings-modal";
    overlay.className = "comfy-modal-overlay";

    // Create modal content
    const modal = document.createElement("div");
    modal.className = "comfy-modal";
    modal.innerHTML = `
      <div class="comfy-modal-header">
        <h2>Civicomfy Settings</h2>
        <button class="comfy-modal-close">&times;</button>
      </div>
      <div class="comfy-modal-body">
        <form id="comfy-settings-form">
          <div class="comfy-form-group">
            <label for="comfy-url">ComfyUI URL:</label>
            <input type="text" id="comfy-url" value="${settings.comfyUrl}" placeholder="http://127.0.0.1:8188">
          </div>
          <div class="comfy-form-group">
            <label for="comfy-api-key">API Key:</label>
            <input type="text" id="comfy-api-key" value="${settings.apiKey}" placeholder="Your API key">
          </div>
          <div class="comfy-form-group">
            <label for="comfy-model-type">Default Model Type:</label>
            <select id="comfy-model-type">
              <option value="">Loading model types...</option>
            </select>
            <small id="model-type-status">Fetching available model types from ComfyUI...</small>
          </div>
          <div class="comfy-form-group">
            <label for="comfy-download-path">Download Path:</label>
            <input type="text" id="comfy-download-path" value="${settings.customDownloadPath}" placeholder="{base_model}/{model_category}">
            <small>Variables: {model_name}, {base_model}, {model_category}, {model_type}</small>
          </div>
          <div class="comfy-form-group">
            <label for="comfy-connections">Number of Connections:</label>
            <input type="number" id="comfy-connections" value="${settings.numConnections}" min="1" max="10">
          </div>
          <div class="comfy-form-group">
            <label>
              <input type="checkbox" id="comfy-force-redownload" ${settings.forceRedownload ? "checked" : ""}>
              Force redownload existing files
            </label>
          </div>
        </form>
      </div>
      <div class="comfy-modal-footer">
        <button type="button" class="comfy-btn comfy-btn-secondary" id="comfy-cancel">Cancel</button>
        <button type="button" class="comfy-btn comfy-btn-primary" id="comfy-save">Save Settings</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Get references to elements
    const modelTypeSelect = modal.querySelector("#comfy-model-type");
    const modelTypeStatus = modal.querySelector("#model-type-status");
    const urlInput = modal.querySelector("#comfy-url");

    // Function to populate model types
    function populateModelTypes(comfyUrl) {
      modelTypeSelect.disabled = true;
      modelTypeStatus.textContent = "Fetching model types...";
      modelTypeStatus.style.color = "#666";

      fetchModelTypes(comfyUrl)
        .then((modelTypes) => {
          // Clear loading option
          modelTypeSelect.innerHTML = "";

          // Add model type options
          Object.entries(modelTypes).forEach(([key, value]) => {
            const option = document.createElement("option");
            option.value = key;
            option.textContent = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
            if (key === settings.modelType) {
              option.selected = true;
            }
            modelTypeSelect.appendChild(option);
          });

          // If current setting is not in the list, add it
          if (!modelTypes[settings.modelType] && settings.modelType) {
            const option = document.createElement("option");
            option.value = settings.modelType;
            option.textContent = settings.modelType.charAt(0).toUpperCase() + settings.modelType.slice(1).replace(/_/g, ' ');
            option.selected = true;
            modelTypeSelect.appendChild(option);
          }

          modelTypeSelect.disabled = false;
          modelTypeStatus.textContent = `Found ${Object.keys(modelTypes).length} model types`;
          modelTypeStatus.style.color = "#28a745";
        })
        .catch((error) => {
          console.error("Failed to fetch model types:", error);

          // Fallback to default options
          const fallbackTypes = ["loras", "checkpoints", "embeddings", "vae", "controlnet"];
          modelTypeSelect.innerHTML = "";

          fallbackTypes.forEach((type) => {
            const option = document.createElement("option");
            option.value = type;
            option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
            if (type === settings.modelType) {
              option.selected = true;
            }
            modelTypeSelect.appendChild(option);
          });

          modelTypeSelect.disabled = false;
          modelTypeStatus.textContent = `Failed to fetch model types: ${error.message}. Using fallback options.`;
          modelTypeStatus.style.color = "#dc3545";
        });
    }

    // Initial load of model types
    populateModelTypes(settings.comfyUrl);

    // Update model types when URL changes
    let urlUpdateTimeout;
    urlInput.addEventListener("input", () => {
      clearTimeout(urlUpdateTimeout);
      urlUpdateTimeout = setTimeout(() => {
        const newUrl = urlInput.value.trim();
        if (newUrl && newUrl !== settings.comfyUrl) {
          populateModelTypes(newUrl);
        }
      }, 1000); // Wait 1 second after user stops typing
    });

    // Event listeners
    const closeBtn = modal.querySelector(".comfy-modal-close");
    const cancelBtn = modal.querySelector("#comfy-cancel");
    const saveBtn = modal.querySelector("#comfy-save");

    function closeModal() {
      overlay.remove();
    }

    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });

    saveBtn.addEventListener("click", () => {
      const form = modal.querySelector("#comfy-settings-form");
      const newSettings = {
        comfyUrl: form.querySelector("#comfy-url").value.trim(),
        apiKey: form.querySelector("#comfy-api-key").value.trim(),
        modelType: form.querySelector("#comfy-model-type").value,
        customDownloadPath: form.querySelector("#comfy-download-path").value.trim(),
        numConnections: parseInt(form.querySelector("#comfy-connections").value, 10),
        forceRedownload: form.querySelector("#comfy-force-redownload").checked
      };

      // Validate settings
      if (!newSettings.comfyUrl) {
        showToast("ComfyUI URL is required", "error");
        return;
      }

      if (!newSettings.modelType) {
        showToast("Please select a model type", "error");
        return;
      }

      // Save and close
      saveSettings(newSettings);
      showToast("Settings saved successfully!", "success");
      closeModal();
    });

    // Focus first input
    modal.querySelector("#comfy-url").focus();
  }

  /** Create and show download options modal **/
  function showDownloadOptionsModal(modelId, modelVersionId, onDownload) {
    // Remove existing modal if any
    const existingModal = document.querySelector("#comfy-download-modal");
    if (existingModal) {
      existingModal.remove();
    }

    const settings = getSettings();

    // Create modal overlay
    const overlay = document.createElement("div");
    overlay.id = "comfy-download-modal";
    overlay.className = "comfy-modal-overlay";

    // Create modal content
    const modal = document.createElement("div");
    modal.className = "comfy-modal";
    modal.innerHTML = `
      <div class="comfy-modal-header">
        <h2>Download Options</h2>
        <button class="comfy-modal-close">&times;</button>
      </div>
      <div class="comfy-modal-body">
        <form id="comfy-download-form">
          <div class="comfy-form-group">
            <label for="download-model-type">Model Type:</label>
            <select id="download-model-type">
              <option value="">Loading model types...</option>
            </select>
            <small id="download-model-type-status">Fetching available model types from ComfyUI...</small>
          </div>
          <div class="comfy-form-group">
            <label for="download-path">Download Path:</label>
            <input type="text" id="download-path" value="${settings.customDownloadPath}" placeholder="{base_model}/{model_category}">
            <small>Variables: {model_name}, {base_model}, {model_category}, {model_type}</small>
          </div>
          <div class="comfy-form-group">
            <label for="download-filename">Custom Filename (optional):</label>
            <input type="text" id="download-filename" value="" placeholder="Leave empty for default filename">
            <small>If specified, this will override the default filename</small>
          </div>
          <div class="comfy-form-group">
            <label for="download-connections">Number of Connections:</label>
            <input type="number" id="download-connections" value="${settings.numConnections}" min="1" max="10">
          </div>
        </form>
      </div>
      <div class="comfy-modal-footer">
        <button type="button" class="comfy-btn comfy-btn-secondary" id="download-cancel">Cancel</button>
        <button type="button" class="comfy-btn comfy-btn-primary" id="download-start">Start Download</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Get references to elements
    const modelTypeSelect = modal.querySelector("#download-model-type");
    const modelTypeStatus = modal.querySelector("#download-model-type-status");

    // Function to populate model types
    function populateModelTypes() {
      modelTypeSelect.disabled = true;
      modelTypeStatus.textContent = "Fetching model types...";
      modelTypeStatus.style.color = "#666";

      fetchModelTypes(settings.comfyUrl)
        .then((modelTypes) => {
          // Clear loading option
          modelTypeSelect.innerHTML = "";

          // Add model type options
          Object.entries(modelTypes).forEach(([key, value]) => {
            const option = document.createElement("option");
            option.value = key;
            option.textContent = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
            if (key === settings.modelType) {
              option.selected = true;
            }
            modelTypeSelect.appendChild(option);
          });

          // If current setting is not in the list, add it
          if (!modelTypes[settings.modelType] && settings.modelType) {
            const option = document.createElement("option");
            option.value = settings.modelType;
            option.textContent = settings.modelType.charAt(0).toUpperCase() + settings.modelType.slice(1).replace(/_/g, ' ');
            option.selected = true;
            modelTypeSelect.appendChild(option);
          }

          modelTypeSelect.disabled = false;
          modelTypeStatus.textContent = `Found ${Object.keys(modelTypes).length} model types`;
          modelTypeStatus.style.color = "#28a745";
        })
        .catch((error) => {
          console.error("Failed to fetch model types:", error);

          // Fallback to default options
          const fallbackTypes = ["loras", "checkpoints", "embeddings", "vae", "controlnet"];
          modelTypeSelect.innerHTML = "";

          fallbackTypes.forEach((type) => {
            const option = document.createElement("option");
            option.value = type;
            option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
            if (type === settings.modelType) {
              option.selected = true;
            }
            modelTypeSelect.appendChild(option);
          });

          modelTypeSelect.disabled = false;
          modelTypeStatus.textContent = `Failed to fetch model types: ${error.message}. Using fallback options.`;
          modelTypeStatus.style.color = "#dc3545";
        });
    }

    // Load model types
    populateModelTypes();

    // Event listeners
    const closeBtn = modal.querySelector(".comfy-modal-close");
    const cancelBtn = modal.querySelector("#download-cancel");
    const startBtn = modal.querySelector("#download-start");

    function closeModal() {
      overlay.remove();
    }

    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });

    startBtn.addEventListener("click", () => {
      const form = modal.querySelector("#comfy-download-form");
      const downloadOptions = {
        modelType: form.querySelector("#download-model-type").value,
        customDownloadPath: form.querySelector("#download-path").value.trim(),
        customFilename: form.querySelector("#download-filename").value.trim(),
        numConnections: parseInt(form.querySelector("#download-connections").value, 10)
      };

      // Validate options
      if (!downloadOptions.modelType) {
        showToast("Please select a model type", "error");
        return;
      }

      if (!downloadOptions.customDownloadPath) {
        showToast("Download path is required", "error");
        return;
      }

      // Execute download
      onDownload(downloadOptions);
      closeModal();
    });

    // Focus first input
    modal.querySelector("#download-model-type").focus();
  }

  /** Execute download with given options **/
  function executeDownload(modelId, modelVersionId, downloadOptions) {
    const settings = getSettings();

    const body = {
      model_url_or_id: modelId,
      model_type: downloadOptions.modelType,
      model_version_id: modelVersionId,
      custom_filename: downloadOptions.customFilename || "",
      custom_download_path: downloadOptions.customDownloadPath,
      num_connections: downloadOptions.numConnections,
      force_redownload: settings.forceRedownload,
      api_key: settings.apiKey,
    };

    GM_xmlhttpRequest({
      method: "POST",
      url: `${settings.comfyUrl}/api/civitai/download`,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify(body),
      onload: (response) => {
        try {
          const json = JSON.parse(response.responseText);
          const msg =
            `${json.status || "ok"}: ${json.message || ""}` +
            (json.filename ? ` → ${json.filename}` : "");
          showToast(msg, json.status === "exists" ? "warn" : "success");
        } catch (err) {
          showToast("Invalid response: " + response.responseText, "error");
        }
      },
      onerror: (err) => {
        showToast("Request failed: " + (err.error || "unknown"), "error");
      },
    });
  }

  /** Inject toast container **/
  function ensureToastContainer() {
    if (document.querySelector("#comfy-toast-container")) return;
    const container = document.createElement("div");
    container.id = "comfy-toast-container";
    document.body.appendChild(container);
  }

  /** Show toast **/
  function showToast(message, type = "info") {
    ensureToastContainer();
    const container = document.querySelector("#comfy-toast-container");

    const toast = document.createElement("div");
    toast.className = `comfy-toast comfy-toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.add("visible");
    });

    // Remove after 5s
    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  /** Extract model version ID from download links **/
  function extractModelVersionId(dlBtn) {

    // First, try to get it from the button's href if it's an anchor tag with a direct download link
    if (dlBtn.tagName.toLowerCase() === 'a') {
      try {
        const href = dlBtn.getAttribute("href");

        if (href && href !== "#") {
          const absoluteHref = new URL(href, window.location.origin);
          const parts = absoluteHref.pathname.split("/");
          const versionId = parts[parts.length - 1];
          return versionId;
        }
      } catch (e) {
        console.error("[Civicomfy] Failed to parse model_version_id from href", e, dlBtn.href);
      }
    }

    // If that fails, look for menu items with type=Model parameter
    // This handles cases where the download button opens a picker
    try {
      // Look for menu dropdown items with type=Model
      const menuItems = document.querySelectorAll('a[href*="type=Model"]');

      for (const item of menuItems) {
        const href = item.getAttribute("href");

        if (href) {
          const url = new URL(href, window.location.origin);
          // Look for pattern like /api/download/models/1639019?type=Model
          const modelIdMatch = url.pathname.match(/\/api\/download\/models\/(\d+)/);
          if (modelIdMatch && modelIdMatch[1]) {
            return modelIdMatch[1];
          }
        }
      }
    } catch (e) {
      console.error("[Civicomfy] Failed to parse model_version_id from menu items", e);
    }

    return null;
  }

  /** Force open picker menu to extract model version ID **/
  function forceExtractModelVersionId(dlBtn) {

    return new Promise((resolve) => {
      // First try normal extraction
      let modelVersionId = extractModelVersionId(dlBtn);
      if (modelVersionId) {
        resolve(modelVersionId);
        return;
      }

      // If that fails, try to trigger the picker menu
      try {
        // Click the download button to open the picker
        dlBtn.click();

        // Wait a short moment for the menu to appear
        setTimeout(() => {
          // Try to extract from the menu items
          modelVersionId = extractModelVersionId(dlBtn);

          // Close the menu by clicking outside or pressing escape
          try {
            // Try clicking the overlay/background to close the menu
            const overlay = document.querySelector('.mantine-Menu-dropdown');

            if (overlay) {
              // Click outside the menu to close it
              document.body.click();
            } else {
              // If no overlay found, try pressing escape
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            }
          } catch (closeError) {
            console.warn("[Civicomfy] Could not close picker menu", closeError);
          }

          resolve(modelVersionId);
        }, 150); // Give menu time to appear

      } catch (clickError) {
        console.error("[Civicomfy] Failed to trigger picker menu", clickError);
        resolve(null);
      }
    });
  }

  /** Add comfy button **/
  function addButton() {

    // Look for both button and a tags with the download tour attribute
    const dlBtn = document.querySelector('a[data-tour="model:download"], button[data-tour="model:download"]');

    if (!dlBtn || dlBtn.dataset.comfyInjected) {
      return;
    }

    dlBtn.dataset.comfyInjected = "true";

    // Extract model id
    const modelMatch = window.location.pathname.match(/\/models\/(\d+)/);
    const modelId = modelMatch ? modelMatch[1] : null;

    // Extract model_version_id
    let modelVersionId = extractModelVersionId(dlBtn);

    // Build comfy button
    const comfyBtn = document.createElement("a");
    comfyBtn.classList.add("comfy-download-btn");
    comfyBtn.href = "#";
    comfyBtn.title = "Left-click: Download options | Right-click: Direct download";

    const logo = document.createElement("img");
    logo.src =
      "https://raw.githubusercontent.com/Comfy-Org/ComfyUI_frontend/refs/heads/main/public/assets/images/comfy-logo-single.svg";
    logo.alt = "Comfy Logo";
    logo.style.width = "24px";
    logo.style.height = "24px";
    comfyBtn.appendChild(logo);

    // Click handler - shows download options modal
    comfyBtn.addEventListener("click", async (e) => {
      e.preventDefault();

      // Re-attempt to get model version ID in case it wasn't available initially
      if (!modelVersionId) {
        showToast("Detecting model version...", "info");
        modelVersionId = await forceExtractModelVersionId(dlBtn);
      }

      if (!modelId || !modelVersionId) {
        console.error("[Civicomfy] Missing required IDs");
        showToast("Could not detect model id or version id", "error");
        return;
      }

      showDownloadOptionsModal(modelId, modelVersionId, (downloadOptions) => {
        executeDownload(modelId, modelVersionId, downloadOptions);
      });
    });

    // Right-click handler - direct download with saved settings
    comfyBtn.addEventListener("contextmenu", async (e) => {
      e.preventDefault();

      // Re-attempt to get model version ID in case it wasn't available initially
      if (!modelVersionId) {
        showToast("Detecting model version...", "info");
        modelVersionId = await forceExtractModelVersionId(dlBtn);
      }

      if (!modelId || !modelVersionId) {
        console.error("[Civicomfy] Missing required IDs for direct download");
        showToast("Could not detect model id or version id", "error");
        return;
      }

      const settings = getSettings();
      const downloadOptions = {
        modelType: settings.modelType,
        customDownloadPath: settings.customDownloadPath,
        customFilename: "",
        numConnections: settings.numConnections
      };

      showToast("Starting direct download with saved settings...", "info");
      executeDownload(modelId, modelVersionId, downloadOptions);
    });

    dlBtn.insertAdjacentElement("afterend", comfyBtn);
  }

  /** CSS for button + toast + modal **/
  const style = document.createElement("style");
  style.textContent = `
    .comfy-download-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: var(--mantine-color-gray-filled);
      border-radius: var(--mantine-radius-default);
      transition: background 0.2s ease;
      margin-left: 4px;
      cursor: pointer;
    }
    .comfy-download-btn:hover {
      background: var(--mantine-color-gray-filled-hover);
    }

    #comfy-toast-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 9999;
    }
    .comfy-toast {
      background: #333;
      color: white;
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 14px;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.3s, transform 0.3s;
      max-width: 320px;
      word-break: break-word;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .comfy-toast.visible {
      opacity: 1;
      transform: translateY(0);
    }
    .comfy-toast-success { background: #2e7d32; }
    .comfy-toast-warn { background: #f9a825; }
    .comfy-toast-error { background: #c62828; }

    /* Modal Styles */
    .comfy-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(4px);
    }

    .comfy-modal {
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      width: 90%;
      max-width: 500px;
      max-height: 90vh;
      overflow: hidden;
      animation: comfyModalSlideIn 0.3s ease;
    }

    @keyframes comfyModalSlideIn {
      from {
        opacity: 0;
        transform: translateY(-20px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .comfy-modal-header {
      padding: 20px 24px 16px;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .comfy-modal-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #333;
    }

    .comfy-modal-close {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #666;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background-color 0.2s;
    }

    .comfy-modal-close:hover {
      background: #f0f0f0;
      color: #333;
    }

    .comfy-modal-body {
      padding: 20px 24px;
      max-height: 60vh;
      overflow-y: auto;
    }

    .comfy-form-group {
      margin-bottom: 16px;
    }

    .comfy-form-group label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      color: #333;
      font-size: 14px;
    }

    .comfy-form-group input,
    .comfy-form-group select {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      transition: border-color 0.2s;
      box-sizing: border-box;
    }

    .comfy-form-group input:focus,
    .comfy-form-group select:focus {
      outline: none;
      border-color: #4285f4;
      box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.2);
    }

    .comfy-form-group input[type="checkbox"] {
      width: auto;
      margin-right: 8px;
    }

    .comfy-form-group small {
      display: block;
      margin-top: 4px;
      color: #666;
      font-size: 12px;
    }

    .comfy-modal-footer {
      padding: 16px 24px 20px;
      border-top: 1px solid #e0e0e0;
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    .comfy-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      min-width: 80px;
    }

    .comfy-btn-primary {
      background: #4285f4;
      color: white;
    }

    .comfy-btn-primary:hover {
      background: #3367d6;
    }

    .comfy-btn-secondary {
      background: #f1f3f4;
      color: #5f6368;
      border: 1px solid #dadce0;
    }

    .comfy-btn-secondary:hover {
      background: #e8eaed;
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .comfy-modal {
        background: #2d2d2d;
        color: #e0e0e0;
      }

      .comfy-modal-header {
        border-bottom-color: #404040;
      }

      .comfy-modal-header h2 {
        color: #e0e0e0;
      }

      .comfy-modal-close {
        color: #bbb;
      }

      .comfy-modal-close:hover {
        background: #404040;
        color: #e0e0e0;
      }

      .comfy-modal-footer {
        border-top-color: #404040;
      }

      .comfy-form-group label {
        color: #e0e0e0;
      }

      .comfy-form-group input,
      .comfy-form-group select {
        background: #1a1a1a;
        border-color: #555;
        color: #e0e0e0;
      }

      .comfy-form-group input:focus,
      .comfy-form-group select:focus {
        border-color: #4285f4;
      }

      .comfy-form-group small {
        color: #aaa;
      }

      .comfy-btn-secondary {
        background: #404040;
        color: #e0e0e0;
        border-color: #555;
      }

      .comfy-btn-secondary:hover {
        background: #4a4a4a;
      }
    }
  `;
  document.head.appendChild(style);

  // Register menu command
  GM_registerMenuCommand("Settings", showSettingsModal);

  const observer = new MutationObserver(() => {
    addButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  addButton();
})();