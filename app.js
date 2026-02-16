(() => {
  const STORAGE_DRAFT_KEY = "rnw_intake_draft";
  const STORAGE_PREFIX = "rnw_intake_";
  const MAX_LOCALSTORAGE_SIZE = 4.5 * 1024 * 1024;

  const form = document.getElementById("intakeForm");
  const toastEl = document.getElementById("toast");
  const restoreBanner = document.getElementById("restoreBanner");
  const restoreDraftBtn = document.getElementById("restoreDraftBtn");
  const dismissRestoreBtn = document.getElementById("dismissRestoreBtn");
  const saveDraftBtn = document.getElementById("saveDraftBtn");
  const submitLockBtn = document.getElementById("submitLockBtn");
  const printBtn = document.getElementById("printBtn");
  const exportJsonBtn = document.getElementById("exportJsonBtn");
  const resetBtn = document.getElementById("resetBtn");
  const recordsSelect = document.getElementById("recordsSelect");
  const photoUploads = document.getElementById("photoUploads");
  const photoPreviewGrid = document.getElementById("photoPreviewGrid");
  const paymentOtherCheck = document.getElementById("paymentOtherCheck");
  const paymentOtherText = document.getElementById("paymentOtherText");
  const signatureDateInput = document.getElementById("signatureDate");
  const printTimestamp = document.getElementById("printTimestamp");
  const modal = document.getElementById("confirmResetModal");

  let draftCache = null;
  let savedPhotos = [];
  let isLocked = false;
  let isSignatureEmpty = true;
  let toastTimeout;
  let autosaveTimeout;

  const signaturePad = document.getElementById("signaturePad");
  const clearSignatureBtn = document.getElementById("clearSignatureBtn");
  const ctx = signaturePad.getContext("2d");
  let drawing = false;

  init();

  function init() {
    prepareSignaturePad();
    signatureDateInput.valueAsDate = new Date();
    printTimestamp.textContent = new Date().toLocaleString();

    setupEventListeners();
    populateFinalRecordsDropdown();
    checkDraftAvailability();
  }

  function setupEventListeners() {
    form.addEventListener("input", onFormChange);
    form.addEventListener("change", onFormChange);

    saveDraftBtn.addEventListener("click", () => {
      saveDraft();
      showToast("Draft saved.");
    });

    submitLockBtn.addEventListener("click", submitAndLock);
    printBtn.addEventListener("click", () => {
      printTimestamp.textContent = new Date().toLocaleString();
      window.print();
    });
    exportJsonBtn.addEventListener("click", exportJson);
    resetBtn.addEventListener("click", openResetModal);

    restoreDraftBtn.addEventListener("click", () => {
      if (draftCache) {
        loadRecord(draftCache, false);
        restoreBanner.classList.add("hidden");
        showToast("Draft restored.");
      }
    });

    dismissRestoreBtn.addEventListener("click", () => restoreBanner.classList.add("hidden"));

    recordsSelect.addEventListener("change", () => {
      const key = recordsSelect.value;
      if (!key) return;
      const raw = localStorage.getItem(key);
      if (!raw) return;
      try {
        loadRecord(JSON.parse(raw), true);
        showToast("Finalized record loaded (read-only).");
      } catch {
        showToast("Unable to load selected record.");
      }
    });

    photoUploads.addEventListener("change", handlePhotoUploads);

    paymentOtherCheck.addEventListener("change", () => {
      paymentOtherText.disabled = !paymentOtherCheck.checked;
      if (!paymentOtherCheck.checked) paymentOtherText.value = "";
    });

    clearSignatureBtn.addEventListener("click", () => {
      clearSignature();
      scheduleAutosave();
    });
  }

  function onFormChange() {
    if (isLocked) return;
    scheduleAutosave();
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimeout);
    autosaveTimeout = setTimeout(() => saveDraft(false), 500);
  }

  setInterval(() => {
    if (!isLocked) saveDraft(false);
  }, 5000);

  function serializeForm() {
    const formData = new FormData(form);
    const payload = {
      meta: {
        generatedAt: new Date().toISOString(),
        locked: isLocked,
      },
      fields: {},
      groups: {
        classification: getCheckedValues("classification"),
        servicesMechanical: getCheckedValues("servicesMechanical"),
        servicesDetailing: getCheckedValues("servicesDetailing"),
        conditionExterior: getCheckedValues("conditionExterior"),
        conditionInterior: getCheckedValues("conditionInterior"),
        acceptedPayments: getCheckedValues("acceptedPayments"),
      },
      signatureDataUrl: isSignatureEmpty ? "" : signaturePad.toDataURL("image/png"),
      photos: [...savedPhotos],
    };

    for (const [key, value] of formData.entries()) {
      if (["classification", "servicesMechanical", "servicesDetailing", "conditionExterior", "conditionInterior", "acceptedPayments"].includes(key)) {
        continue;
      }
      payload.fields[key] = value;
    }

    payload.fields.signatureDate = signatureDateInput.value;
    payload.fields.paymentOtherEnabled = paymentOtherCheck.checked;
    return payload;
  }

  function saveDraft(showResult = false) {
    const payload = serializeForm();
    const json = JSON.stringify(payload);
    if (json.length > MAX_LOCALSTORAGE_SIZE) {
      showToast("Draft too large for local storage. Photos kept in memory.");
      const shallowPayload = { ...payload, photos: [] };
      localStorage.setItem(STORAGE_DRAFT_KEY, JSON.stringify(shallowPayload));
      return;
    }
    localStorage.setItem(STORAGE_DRAFT_KEY, json);
    if (showResult) showToast("Draft saved.");
  }

  function checkDraftAvailability() {
    const raw = localStorage.getItem(STORAGE_DRAFT_KEY);
    if (!raw) return;
    try {
      draftCache = JSON.parse(raw);
      restoreBanner.classList.remove("hidden");
    } catch {
      localStorage.removeItem(STORAGE_DRAFT_KEY);
    }
  }

  function loadRecord(data, lock = false) {
    resetFormState(false);
    const { fields = {}, groups = {}, signatureDataUrl = "", photos = [] } = data;

    for (const [name, value] of Object.entries(fields)) {
      const elements = form.elements[name];
      if (!elements) continue;

      if (elements instanceof RadioNodeList) {
        if (elements[0] && elements[0].type === "radio") {
          for (const el of elements) {
            el.checked = el.value === value;
          }
        } else {
          elements.value = value;
        }
      } else if (elements.type === "checkbox") {
        elements.checked = Boolean(value);
      } else {
        elements.value = value;
      }
    }

    setCheckedValues("classification", groups.classification || []);
    setCheckedValues("servicesMechanical", groups.servicesMechanical || []);
    setCheckedValues("servicesDetailing", groups.servicesDetailing || []);
    setCheckedValues("conditionExterior", groups.conditionExterior || []);
    setCheckedValues("conditionInterior", groups.conditionInterior || []);
    setCheckedValues("acceptedPayments", groups.acceptedPayments || []);

    paymentOtherText.disabled = !paymentOtherCheck.checked;
    savedPhotos = photos;
    renderPhotoPreviews();
    drawSignatureFromDataUrl(signatureDataUrl);

    if (lock) {
      applyLock(true);
    }
  }

  function validateForm() {
    const requiredIds = ["fullName", "phonePrimary", "email", "vehicleYear", "vehicleMake", "vehicleModel", "clientInitials"];
    let valid = true;

    requiredIds.forEach((id) => {
      const el = document.getElementById(id);
      const isFieldValid = el.value.trim().length > 0;
      markValidity(el, isFieldValid);
      if (!isFieldValid) valid = false;
    });

    const emailEl = document.getElementById("email");
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim());
    markValidity(emailEl, emailOk);
    if (!emailOk) valid = false;

    const preferredContactSelected = !!form.querySelector('input[name="preferredContact"]:checked');
    if (!preferredContactSelected) valid = false;

    const agreementEl = document.getElementById("agreementAccepted");
    markValidity(agreementEl, agreementEl.checked);
    if (!agreementEl.checked) valid = false;

    if (isSignatureEmpty) {
      signaturePad.setAttribute("aria-invalid", "true");
      valid = false;
    } else {
      signaturePad.removeAttribute("aria-invalid");
    }

    if (!valid) showToast("Please complete all required fields before submitting.");
    return valid;
  }

  function markValidity(el, isValid) {
    if (!el) return;
    el.setAttribute("aria-invalid", String(!isValid));
  }

  function submitAndLock() {
    if (isLocked) return;
    if (!validateForm()) return;

    const payload = serializeForm();
    payload.meta.locked = true;
    payload.meta.finalizedAt = new Date().toISOString();

    const timestamp = formatTimestamp(new Date());
    const key = `${STORAGE_PREFIX}${timestamp}`;
    localStorage.setItem(key, JSON.stringify(payload));

    applyLock(true);
    populateFinalRecordsDropdown();
    showToast("Form submitted and locked.");
  }

  function applyLock(locked) {
    isLocked = locked;
    document.body.classList.toggle("locked", locked);
    Array.from(form.elements).forEach((el) => {
      if (["printBtn", "exportJsonBtn", "recordsSelect", "saveDraftBtn"].includes(el.id)) return;
      if (el.id === "photoUploads") el.disabled = locked;
      else el.disabled = locked;
    });
    clearSignatureBtn.disabled = locked;
    submitLockBtn.disabled = locked;
  }

  function getCheckedValues(name) {
    return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map((el) => el.value);
  }

  function setCheckedValues(name, values) {
    const set = new Set(values);
    form.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
      el.checked = set.has(el.value);
    });
  }

  async function handlePhotoUploads() {
    const files = Array.from(photoUploads.files || []);
    if (!files.length) return;

    const loaded = [];
    for (const file of files) {
      try {
        const dataUrl = await fileToDataUrl(file);
        loaded.push({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl,
        });
      } catch {
        showToast(`Unable to read ${file.name}`);
      }
    }

    savedPhotos = [...savedPhotos, ...loaded];
    renderPhotoPreviews();
    scheduleAutosave();
  }

  function renderPhotoPreviews() {
    photoPreviewGrid.innerHTML = "";
    savedPhotos.forEach((photo) => {
      const item = document.createElement("div");
      item.className = "photo-item";
      const img = document.createElement("img");
      img.src = photo.dataUrl;
      img.alt = photo.name;
      const label = document.createElement("p");
      label.textContent = photo.name;
      item.append(img, label);
      photoPreviewGrid.appendChild(item);
    });
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function exportJson() {
    const payload = serializeForm();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rags_wrenches_intake_${formatTimestamp(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function populateFinalRecordsDropdown() {
    const current = recordsSelect.value;
    recordsSelect.innerHTML = '<option value="">Select finalized record...</option>';
    const keys = Object.keys(localStorage)
      .filter((key) => key.startsWith(STORAGE_PREFIX) && key !== STORAGE_DRAFT_KEY)
      .sort()
      .reverse();

    keys.forEach((key) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = key.replace(STORAGE_PREFIX, "").replace(/_/g, " ");
      recordsSelect.appendChild(option);
    });

    recordsSelect.value = current;
  }

  function openResetModal() {
    if (typeof modal.showModal === "function") {
      modal.showModal();
      modal.addEventListener(
        "close",
        () => {
          if (modal.returnValue === "confirm") {
            resetFormState(true);
            showToast("Form reset.");
          }
        },
        { once: true }
      );
      return;
    }

    if (window.confirm("This will clear current draft data and signature. Continue?")) {
      resetFormState(true);
      showToast("Form reset.");
    }
  }

  function resetFormState(clearStorage) {
    form.reset();
    signatureDateInput.valueAsDate = new Date();
    clearSignature();
    savedPhotos = [];
    renderPhotoPreviews();
    paymentOtherText.disabled = true;
    applyLock(false);

    if (clearStorage) {
      localStorage.removeItem(STORAGE_DRAFT_KEY);
    }
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  function formatTimestamp(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");
    return `${y}${m}${d}_${h}${min}${s}`;
  }

  function prepareSignaturePad() {
    clearSignature();

    const getPoint = (event) => {
      const rect = signaturePad.getBoundingClientRect();
      const pointer = event.touches ? event.touches[0] : event;
      return {
        x: ((pointer.clientX - rect.left) / rect.width) * signaturePad.width,
        y: ((pointer.clientY - rect.top) / rect.height) * signaturePad.height,
      };
    };

    const startDrawing = (event) => {
      if (isLocked) return;
      event.preventDefault();
      drawing = true;
      isSignatureEmpty = false;
      const { x, y } = getPoint(event);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };

    const draw = (event) => {
      if (!drawing || isLocked) return;
      event.preventDefault();
      const { x, y } = getPoint(event);
      ctx.lineTo(x, y);
      ctx.stroke();
    };

    const stopDrawing = () => {
      if (!drawing) return;
      drawing = false;
      scheduleAutosave();
    };

    signaturePad.addEventListener("mousedown", startDrawing);
    signaturePad.addEventListener("mousemove", draw);
    signaturePad.addEventListener("mouseup", stopDrawing);
    signaturePad.addEventListener("mouseleave", stopDrawing);

    signaturePad.addEventListener("touchstart", startDrawing, { passive: false });
    signaturePad.addEventListener("touchmove", draw, { passive: false });
    signaturePad.addEventListener("touchend", stopDrawing);

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#e3e7eb";
  }

  function clearSignature() {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, signaturePad.width, signaturePad.height);
    isSignatureEmpty = true;
    signaturePad.removeAttribute("aria-invalid");
  }

  function drawSignatureFromDataUrl(dataUrl) {
    clearSignature();
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, signaturePad.width, signaturePad.height);
      isSignatureEmpty = false;
    };
    img.src = dataUrl;
  }
})();
