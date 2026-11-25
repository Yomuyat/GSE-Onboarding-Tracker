(function () {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const LEVELS = ["Not started", "Understanding", "Value Proposition", "Demo Capability"];
  const STATUSES = ["Not Started", "In Progress", "Completed"];
  const EDIT_FIELDS = {
    competencies: ["Level", "TargetLevel", "Coach", "Comments"],
    learning: ["Status", "ContentURL", "SupplementalURL", "Notes"]
  };
  const NUMERIC_FIELDS = ["Level", "TargetLevel"];
  const characterKey = "gse-galaxy-v1:" + new URL("../", document.currentScript.src).pathname + ":";
  const journeyStates = new Map();
  const compactMap = window.matchMedia("(max-width: 900px)");
  const PIXEL_COLORS = ["#81e6ff", "#7962d9", "#f5f0ff", "#263253", "#ffcb81", "#ff8aa8", "#93ebca", "#5a9ce6", "#b6a2ff", "#e66b45"];
  const SECTOR_COLORS = ["#81e6ff", "#b6a2ff", "#ffcb81", "#ff8aa8", "#93ebca", "#81b7ff"];
  let data = null;
  let busy = false;
  let editing = null;
  let travel = null;
  let characterDraft = null;
  let paintColor = PIXEL_COLORS[0];
  let erasing = false;
  let paintingPointer = null;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    })[char]);
  }

  function formatDate(value) {
    if (!value) return "Not recorded";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Invalid date" : new Intl.DateTimeFormat(undefined, {
      day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
    }).format(date);
  }

  function badge(status) {
    return '<span class="badge ' + status.toLowerCase().replace(/ /g, "-") + '">' + esc(status) + '</span>';
  }

  function sequence() {
    return Object.values(data.competencyGroups).flat();
  }

  function stepOf(competency) {
    return sequence().indexOf(competency) + 1;
  }

  function maxLevel(competency) {
    return data.maxLevels[competency] || 3;
  }

  function rowStatus(row) {
    if (row.Level >= row.TargetLevel) return "ON TARGET";
    return row.TargetLevel - row.Level >= 2 ? "NEEDS ATTENTION" : "DEVELOPING";
  }

  function employeeRows(collection, employeeId) {
    return data[collection].filter(row => row.EmployeeID === employeeId);
  }

  function metrics(employeeId) {
    const rows = employeeRows("competencies", employeeId);
    const learning = employeeRows("learning", employeeId);
    const achieved = rows.reduce((sum, row) => sum + row.Level, 0);
    const possible = rows.reduce((sum, row) => sum + maxLevel(row.Competency), 0);
    return {
      achieved: achieved, possible: possible,
      readiness: possible ? achieved / possible : null,
      onTarget: rows.filter(row => rowStatus(row) === "ON TARGET").length,
      learningDone: learning.filter(row => row.Status === "Completed").length,
      learningTotal: learning.length
    };
  }

  function percent(value) {
    return value == null ? "-" : Math.round(value * 100) + "%";
  }

  function kpi(label, value, detail) {
    return '<article class="kpi-card"><div class="kpi-label">' + esc(label) + '</div><div class="kpi-value">' +
      esc(value) + '</div><div class="kpi-detail">' + esc(detail) + '</div></article>';
  }

  function selectedEmployee() {
    return data.employees.find(row => row.EmployeeID === $("#employee-select").value);
  }

  function updateControls(message) {
    $("#refresh-button").disabled = busy || editing !== null || characterDraft !== null;
    document.querySelectorAll("[data-open-form]").forEach(control => { control.disabled = busy; });
    $("#form-fields").disabled = busy;
    $("#form-save").disabled = busy;
    $("#form-cancel").disabled = busy;
    $("#form-close").disabled = busy;
    $("#form-save").textContent = busy && editing ? "Saving..." : "Save progress";
    updateJourneyControls();
    if (message) $("#save-status").textContent = message;
  }

  function error(message) {
    $("#error-banner").textContent = message;
    $("#error-banner").hidden = false;
  }

  function acceptData(model) {
    data = model;
    const employeeId = $("#employee-select").value;
    $("#employee-select").innerHTML = data.employees.map(employee =>
      '<option value="' + esc(employee.EmployeeID) + '">' + esc(employee.EmployeeName) + " - " + esc(employee.EmployeeID) + '</option>'
    ).join("");
    if (data.employees.some(row => row.EmployeeID === employeeId)) $("#employee-select").value = employeeId;
    $("#last-updated").textContent = "Loaded " + new Intl.DateTimeFormat(undefined, {
      day: "2-digit", month: "short", hour: "numeric", minute: "2-digit"
    }).format(new Date());
    $("#error-banner").hidden = true;
    renderEmployee();
  }

  function renderEmployee() {
    const employee = selectedEmployee();
    if (!employee) return;
    $("#employee-meta").innerHTML = [["Manager", employee.Manager], ["Country", employee.Country],
      ["Week", employee.CurrentWeek], ["Start", formatDate(employee.StartDate)],
      ["Target completion", formatDate(employee.TargetCompletionDate)], ["Status", employee.Status]]
      .map(([label, value]) => '<span><small>' + label + '</small>' + esc(value) + '</span>').join("");
    renderSummary();
    renderJourney();
  }

  function defaultPixels() {
    const palette = { s: "#f5f0ff", v: "#81e6ff", d: "#263253", p: "#7962d9", g: "#93ebca" };
    return [
      "....ssss....", "...ssssss...", "..ssvvvvss..", "..svvdvvvs..",
      "..svvvvvvs..",       "..ssssssss..", "...spppps...", "..sspggpss..",
      "..s.pppp.s..", "....pppp....", "...ss..ss...", "...dd..dd..."
    ].join("").split("").map(pixel => palette[pixel] || null);
  }

  function pixelSprite(pixels) {
    return '<svg class="pixel-sprite" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">' +
      pixels.map((color, index) => color ? '<rect x="' + index % 12 + '" y="' + Math.floor(index / 12) +
        '" width="1" height="1" fill="' + color + '"></rect>' : "").join("") + '</svg>';
  }

  function storageMessage(state) {
    $("#journey-storage-status").textContent = state.storageError ||
      "Your character and map position are saved in this browser for each GSE.";
    $("#journey-storage-status").classList.toggle("storage-error", Boolean(state.storageError));
  }

  function journeyState() {
    const employee = selectedEmployee();
    if (journeyStates.has(employee.EmployeeID)) return journeyStates.get(employee.EmployeeID);
    const state = { position: 0, name: "Space explorer", pixels: defaultPixels(), storageError: "" };
    try {
      const saved = localStorage.getItem(characterKey + employee.EmployeeID);
      if (saved !== null) {
        const value = JSON.parse(saved);
        if (!value || !Number.isInteger(value.position) || value.position < 0 || value.position >= sequence().length ||
            typeof value.name !== "string" || !value.name.trim() || value.name.length > 24 ||
            !Array.isArray(value.pixels) || value.pixels.length !== 144 ||
            !value.pixels.every(pixel => pixel === null || (typeof pixel === "string" && /^#[0-9a-f]{6}$/i.test(pixel)))) {
          throw new Error("The saved character or map position has an invalid format.");
        }
        state.position = value.position;
        state.name = value.name;
        state.pixels = value.pixels;
      }
    } catch (reason) {
      state.storageError = "Could not load your browser journey: " + reason.message +
        " A default explorer is shown. Save a character to retry.";
    }
    journeyStates.set(employee.EmployeeID, state);
    return state;
  }

  function persistJourney(state) {
    try {
      localStorage.setItem(characterKey + selectedEmployee().EmployeeID, JSON.stringify({
        position: state.position, name: state.name, pixels: state.pixels
      }));
      state.storageError = "";
      storageMessage(state);
      return true;
    } catch (reason) {
      state.storageError = "Could not save your browser journey: " + reason.message +
        " Changes cannot be restored after closing this page unless a later save succeeds.";
      storageMessage(state);
      return false;
    }
  }

  function stagePosition(index) {
    const columns = compactMap.matches ? 4 : 7;
    const row = Math.floor(index / columns);
    const column = row % 2 ? columns - 1 - index % columns : index % columns;
    return { x: compactMap.matches ? 14 + column * 24 : 8 + column * 14,
      y: compactMap.matches ? 12.5 + row * 24 : 25 + row * 50 };
  }

  function updateJourneyControls() {
    if (!data || !selectedEmployee()) {
      for (const id of ["journey-prev", "journey-next", "character-open", "focus-next-stage"]) $("#" + id).disabled = true;
      return;
    }
    const position = journeyState().position;
    $("#journey-prev").disabled = busy || Boolean(travel) || position === 0;
    $("#journey-next").disabled = busy || Boolean(travel) || position === sequence().length - 1;
    document.querySelectorAll("[data-stage]").forEach(button => {
      button.disabled = busy;
      button.setAttribute("aria-disabled", String(busy || Boolean(travel)));
    });
    $("#galaxy-map").setAttribute("aria-busy", String(Boolean(travel)));
    $("#character-open").disabled = busy;
    $("#focus-next-stage").disabled = busy || Boolean(travel);
  }

  function renderJourney() {
    if (travel) { travel.cancel(); travel = null; }
    const employee = selectedEmployee();
    const state = journeyState();
    const names = sequence();
    const rows = employeeRows("competencies", employee.EmployeeID);
    const done = rows.filter(row => rowStatus(row) === "ON TARGET").length;
    const nextStage = $("#focus-next-stage").hidden ? -1 : Number($("#focus-next-stage").dataset.nextStage);
    $("#journey-progress").textContent = done + " / " + names.length + " planets on target";
    $("#explorer-name").textContent = state.name;
    $("#galaxy-stages").innerHTML = names.map((name, index) => {
      const row = rows.find(item => item.Competency === name);
      const complete = row && rowStatus(row) === "ON TARGET";
      const recommended = index === nextStage;
      const group = Object.values(data.competencyGroups).findIndex(items => items.includes(name));
      const point = stagePosition(index);
      return '<button type="button" class="planet-stage' + (complete ? " is-complete" : "") +
        (recommended ? " is-next" : "") + '" data-stage="' + index +
        '" style="--x:' + point.x + '%;--y:' + point.y + '%;--planet-color:' + SECTOR_COLORS[group % SECTOR_COLORS.length] +
        '"' + (index === state.position ? ' aria-current="step"' : "") + ' aria-label="Stage ' + (index + 1) + ': ' +
        esc(name) + (complete ? ', on target' : ', to explore') + (recommended ? ', next action' : '') +
        '"><span class="planet-orb" aria-hidden="true">' +
        (index + 1) + '</span><span class="planet-label">' + esc(name) + '<small>' +
        (recommended ? "NEXT UP \u00b7 " : "") +
        (row ? "LEVEL " + row.Level + " / " + maxLevel(name) : "NOT ASSESSED") + '</small></span></button>';
    }).join("");
    $(".galaxy-route polyline").setAttribute("points", names.map((name, index) => {
      const point = stagePosition(index);
      return point.x + "," + point.y;
    }).join(" "));
    const point = stagePosition(state.position);
    $("#journey-character").style.setProperty("--x", point.x + "%");
    $("#journey-character").style.setProperty("--y", point.y + "%");
    $("#journey-character").innerHTML = pixelSprite(state.pixels);
    const name = names[state.position];
    const index = data.competencies.findIndex(row => row.EmployeeID === employee.EmployeeID && row.Competency === name);
    const row = data.competencies[index];
    const group = Object.keys(data.competencyGroups).find(key => data.competencyGroups[key].includes(name));
    const modules = data.learning.map((item, moduleIndex) => ({ row: item, index: moduleIndex }))
      .filter(item => item.row.EmployeeID === employee.EmployeeID && item.row.Competency === name);
    $("#stage-detail").innerHTML = '<div class="stage-overview"><p class="stage-sector">DESTINATION ' + String(state.position + 1).padStart(2, "0") +
      " / " + esc(group) + '</p><h3>' + esc(name) + '</h3>' + (row ?
        '<p class="stage-readiness">Level ' + row.Level + ' &middot; ' + LEVELS[row.Level] + '<br>Target: level ' +
        row.TargetLevel + " &middot; " + LEVELS[row.TargetLevel] + '</p>' + badge(rowStatus(row)) +
        '<div>' + editButton("competencies", index, "Update readiness", "Update " + name + " level from map") + '</div>' :
        '<p class="empty-state">No assessment is available for this stage.</p>') +
      '<p class="stage-level-guide">Levels are cumulative: 1 Understanding (explain the technology); ' +
      '2 Value Proposition (connect it to customer needs)' +
      (maxLevel(name) === 3 ? '; 3 Demo Capability (deliver a demonstration)' : '') +
      '. Level 0 means not started.</p></div>' +
      '<div class="stage-learning"><h4>Your mission resources</h4>' + (modules.length ? modules.map(item =>
        '<div class="stage-module"><p>' + esc(item.row.Module) + '</p>' +
        learningLink(item.row.ContentURL, "Learn") + ' ' + learningLink(item.row.SupplementalURL, "Extra") +
        '<small>' + esc(item.row.Status) + '</small>' + editButton("learning", item.index, "Edit learning", "Edit " +
        item.row.Module + " from map") + '</div>').join("") :
        '<p class="empty-state">No learning resources are available for this stage.</p>') + '</div>';
    $("#journey-location").textContent = "Stage " + (state.position + 1) + " of " + names.length + " - " + name;
    storageMessage(state);
    updateJourneyControls();
    updateControls();
  }

  function moveStage(position, focusStage) {
    if (!data || busy || editing || travel) return;
    const state = journeyState();
    if (position < 0 || position >= sequence().length || position === state.position) return;
    const previous = state.position;
    state.position = position;
    persistJourney(state);
    renderJourney();
    if (focusStage) document.querySelector('[data-stage="' + position + '"]').focus({ preventScroll: true });
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const direction = position > previous ? 1 : -1;
      const frames = [];
      for (let index = previous; index !== position + direction; index += direction) {
        const point = stagePosition(index);
        frames.push({ left: point.x + "%", top: point.y + "%" });
      }
      travel = $("#journey-character").animate(frames, {
        duration: Math.min(1800, Math.abs(position - previous) * 200 + 160), easing: "ease-in-out"
      });
      travel.onfinish = () => { travel = null; updateJourneyControls(); };
    }
    updateJourneyControls();
  }

  function renderPixelPreview() {
    $("#character-preview").innerHTML = pixelSprite(characterDraft.pixels);
  }

  function renderPixelGrid() {
    $("#pixel-grid").innerHTML = characterDraft.pixels.map((color, index) =>
      '<button class="pixel-cell" type="button" data-pixel="' + index + '" tabindex="' + (index === 0 ? 0 : -1) +
      '" style="background-color:' + (color || "transparent") + '" aria-label="Row ' + (Math.floor(index / 12) + 1) +
      ', column ' + (index % 12 + 1) + ', ' + (color || "transparent") + '"></button>'
    ).join("");
    renderPixelPreview();
  }

  function selectPaint(color) {
    paintColor = color;
    erasing = false;
    $("#pixel-color").value = color;
    $("#pixel-eraser").setAttribute("aria-pressed", "false");
    document.querySelectorAll("[data-paint]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.paint === color));
    });
  }

  function paintPixel(button) {
    if (!characterDraft || !button) return;
    const index = Number(button.dataset.pixel);
    const color = erasing ? null : paintColor;
    characterDraft.pixels[index] = color;
    button.style.backgroundColor = color || "transparent";
    button.setAttribute("aria-label", "Row " + (Math.floor(index / 12) + 1) + ", column " + (index % 12 + 1) +
      ", " + (color || "transparent"));
    renderPixelPreview();
  }

  function openCharacter() {
    if (busy || editing || !data) return;
    characterDraft = structuredClone(journeyState());
    $("#character-name").value = characterDraft.name;
    $("#character-error").hidden = true;
    $("#pixel-palette").innerHTML = PIXEL_COLORS.map(color =>
      '<button type="button" class="pixel-swatch" data-paint="' + color + '" style="background-color:' + color +
      '" aria-label="Paint ' + color + '" aria-pressed="false"></button>'
    ).join("");
    selectPaint(paintColor);
    renderPixelGrid();
    $("#character-dialog").showModal();
    updateControls();
  }

  function closeCharacter() {
    paintingPointer = null;
    characterDraft = null;
    $("#character-dialog").close();
    updateControls();
    $("#character-open").focus({ preventScroll: true });
  }

  function characterChanged() {
    if (!characterDraft) return false;
    const state = journeyState();
    return $("#character-name").value !== state.name ||
      characterDraft.pixels.some((pixel, index) => pixel !== state.pixels[index]);
  }

  function renderSummary() {
    const employee = selectedEmployee();
    const summary = metrics(employee.EmployeeID);
    const total = sequence().length;
    $("#employee-kpis").innerHTML =
      kpi("Readiness", percent(summary.readiness), summary.achieved + " of " + summary.possible + " levels achieved") +
      kpi("On target", summary.onTarget + " / " + total, "competencies at target level") +
      kpi("Learning", summary.learningDone + " / " + summary.learningTotal, "modules completed");
    const rows = employeeRows("competencies", employee.EmployeeID);
    const remaining = sequence().map((name, index) => ({
      name: name, index: index, row: rows.find(row => row.Competency === name)
    })).filter(item => !item.row || item.row.Level < item.row.TargetLevel);
    const action = remaining[0];
    const button = $("#focus-next-stage");
    button.hidden = !action;
    if (!action) {
      $("#next-action-heading").textContent = "All stages are on target";
      $("#next-action-description").textContent = "Explore any planet to review readiness and learning.";
      return;
    }
    button.dataset.nextStage = String(action.index);
    $("#next-action-heading").textContent = "Stage " + (action.index + 1) + ": " + action.name;
    $("#next-action-description").textContent = action.row
      ? "Reach level " + (action.row.Level + 1) + " - " + LEVELS[action.row.Level + 1] +
        " (currently " + action.row.Level + ", target " + action.row.TargetLevel + "). " +
        remaining.length + (remaining.length === 1 ? " stage remains." : " stages remain.")
      : "This stage has no assessment record. Refresh to reload your progress.";
  }

  function editButton(collection, index, label, accessibleLabel) {
    return '<button type="button" class="button button-small" data-open-form="' + collection + '" data-index="' +
      index + '" aria-label="' + esc(accessibleLabel) + '">' + esc(label) + '</button>';
  }

  function learningLink(url, label) {
    if (!url) return "";
    try {
      if (!["http:", "https:"].includes(new URL(url).protocol)) return "";
    } catch (reason) {
      return "";
    }
    return '<a class="resource-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + ' &nearr;</a>';
  }

  function choices(name, legend, options, current) {
    return '<fieldset class="form-choice-group"><legend>' + esc(legend) + '</legend><div class="form-choices">' +
      options.map(option => '<label class="form-choice"><input type="radio" name="' + name + '" value="' + esc(option.value) + '"' +
        (option.value === current ? " checked" : "") + ' required>' + (option.number != null ?
          '<span class="choice-score">' + option.number + '</span>' : "") + '<span>' + esc(option.label) + '</span></label>'
      ).join("") + '</div></fieldset>';
  }

  function textControl(row, field, label, type) {
    const attributes = ' name="' + field + '" id="form-' + field + '" maxlength="' + (type === "url" ? 2000 : 4000) + '"';
    const control = type === "textarea"
      ? '<textarea' + attributes + ' rows="3">' + esc(row[field]) + '</textarea>'
      : '<input type="' + (type || "text") + '"' + attributes + ' value="' + esc(row[field]) + '">';
    return '<label class="resource-field" for="form-' + field + '"><span>' + esc(label) + '</span>' + control + '</label>';
  }

  function openForm(collection, index, opener) {
    if (busy || editing || !data) return;
    const row = data[collection][index];
    const employee = data.employees.find(item => item.EmployeeID === row.EmployeeID);
    editing = { collection: collection, index: index, row: structuredClone(row), revision: data.revision, opener: opener };
    $("#form-employee").textContent = employee.EmployeeName + " - " + employee.EmployeeID;
    $("#form-error").hidden = true;
    if (collection === "competencies") {
      const max = maxLevel(row.Competency);
      const levels = LEVELS.slice(0, max + 1).map((label, level) => ({ value: level, number: level, label: label }));
      $("#form-title").textContent = stepOf(row.Competency) + ". " + row.Competency;
      $("#form-description").textContent = "Levels are cumulative. " + row.Competency + " is assessed up to level " + max +
        " (" + LEVELS[max] + "). Last assessed: " + formatDate(row.LastAssessment) + ".";
      $("#form-fields").innerHTML = choices("Level", "Current level", levels, row.Level) +
        choices("TargetLevel", "Target level", levels.slice(1), row.TargetLevel) +
        textControl(row, "Coach", "Coach") + textControl(row, "Comments", "Evidence / coaching notes", "textarea");
    } else {
      $("#form-title").textContent = stepOf(row.Competency) + ". " + row.Module;
      $("#form-description").textContent = "Update learning status and resource links for " + row.Competency + ".";
      $("#form-fields").innerHTML = choices("Status", "Learning status",
        STATUSES.map(status => ({ value: status, label: status })), row.Status) +
        textControl(row, "ContentURL", "Learning content URL", "url") +
        textControl(row, "SupplementalURL", "Supplemental URL", "url") + textControl(row, "Notes", "Learning notes", "textarea");
    }
    updateControls();
    $("#update-dialog").showModal();
  }

  function formChanges() {
    const values = new FormData($("#update-form"));
    const changes = {};
    EDIT_FIELDS[editing.collection].forEach(field => {
      const value = NUMERIC_FIELDS.includes(field) ? Number(values.get(field)) : String(values.get(field) ?? "");
      if (value !== (editing.row[field] ?? "")) changes[field] = value;
    });
    return changes;
  }

  function closeForm(message) {
    const previous = editing;
    editing = null;
    $("#update-dialog").close();
    updateControls(message);
    if (previous) {
      const opener = previous.opener && previous.opener.isConnected ? previous.opener :
        document.querySelector('[data-open-form="' + previous.collection + '"][data-index="' + previous.index + '"]');
      if (opener) opener.focus({ preventScroll: true });
    }
  }

  async function refresh() {
    if (busy || editing) return;
    busy = true;
    updateControls("Loading progress...");
    let message;
    try {
      acceptData(await window.GSEDataService.load());
      message = "Progress loaded";
    } catch (reason) {
      error(reason.message);
      message = "Unable to load progress";
    } finally {
      busy = false;
      updateControls(message);
    }
  }

  async function submitForm(event) {
    event.preventDefault();
    if (busy || !editing || !$("#update-form").reportValidity()) return;
    const changes = formChanges();
    if (!Object.keys(changes).length) {
      closeForm("No changes to save");
      return;
    }
    const { collection, row, revision } = editing;
    const update = {
      collection: collection,
      EmployeeID: row.EmployeeID, Competency: row.Competency, Module: row.Module, changes: changes
    };
    busy = true;
    $("#form-error").hidden = true;
    updateControls("Saving progress...");
    try {
      const model = await window.GSEDataService.save(revision, update);
      busy = false;
      acceptData(model);
      closeForm("Saved in this browser");
    } catch (reason) {
      $("#form-error").textContent = reason.message + " Your form edits are kept and have not been saved.";
      $("#form-error").hidden = false;
      $("#form-error").focus();
      updateControls("Not saved - see the error in the form");
    } finally {
      busy = false;
      updateControls();
    }
  }

  $("#refresh-button").addEventListener("click", refresh);
  $("#focus-next-stage").addEventListener("click", () => {
    if (!data || busy || travel) return;
    const position = Number($("#focus-next-stage").dataset.nextStage);
    moveStage(position, false);
    const detail = $("#stage-detail");
    detail.focus({ preventScroll: true });
    detail.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest"
    });
  });
  $("#journey-prev").addEventListener("click", () => { if (data) moveStage(journeyState().position - 1); });
  $("#journey-next").addEventListener("click", () => { if (data) moveStage(journeyState().position + 1); });
  $("#galaxy-map").addEventListener("click", event => {
    const button = event.target.closest("[data-stage]");
    if (button) moveStage(Number(button.dataset.stage), true);
  });
  $("#galaxy-map").addEventListener("keydown", event => {
    if (!data || !event.target.closest("[data-stage]")) return;
    const deltas = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (event.key in deltas || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const position = event.key === "Home" ? 0 : event.key === "End" ? sequence().length - 1 :
        journeyState().position + deltas[event.key];
      moveStage(position, true);
    }
  });
  compactMap.addEventListener("change", () => { if (data && selectedEmployee()) renderJourney(); });
  $("#character-open").addEventListener("click", openCharacter);
  $("#character-close").addEventListener("click", closeCharacter);
  $("#character-cancel").addEventListener("click", closeCharacter);
  $("#character-dialog").addEventListener("cancel", event => { event.preventDefault(); closeCharacter(); });
  $("#character-form").addEventListener("submit", event => {
    event.preventDefault();
    if (!characterDraft || !$("#character-form").reportValidity()) return;
    const name = $("#character-name").value.trim();
    if (!name || name.length > 24 || !characterDraft.pixels.some(Boolean)) {
      $("#character-error").textContent = "Enter an explorer name (1-24 characters) and paint at least one pixel.";
      $("#character-error").hidden = false;
      return;
    }
    characterDraft.name = name;
    if (!persistJourney(characterDraft)) {
      $("#character-error").textContent = "Your character was not saved. " + characterDraft.storageError;
      $("#character-error").hidden = false;
      return;
    }
    Object.assign(journeyState(), characterDraft);
    renderJourney();
    closeCharacter();
  });
  $("#pixel-color").addEventListener("input", event => selectPaint(event.target.value));
  $("#pixel-palette").addEventListener("click", event => {
    const button = event.target.closest("[data-paint]");
    if (button) selectPaint(button.dataset.paint);
  });
  $("#pixel-eraser").addEventListener("click", () => {
    erasing = !erasing;
    $("#pixel-eraser").setAttribute("aria-pressed", String(erasing));
    document.querySelectorAll("[data-paint]").forEach(button => {
      button.setAttribute("aria-pressed", String(!erasing && button.dataset.paint === paintColor));
    });
  });
  $("#pixel-reset").addEventListener("click", () => { characterDraft.pixels = defaultPixels(); renderPixelGrid(); });
  $("#pixel-clear").addEventListener("click", () => { characterDraft.pixels.fill(null); renderPixelGrid(); });
  $("#pixel-grid").addEventListener("click", event => paintPixel(event.target.closest("[data-pixel]")));
  $("#pixel-grid").addEventListener("pointerdown", event => {
    const button = event.target.closest("[data-pixel]");
    if (!button || event.button !== 0) return;
    event.preventDefault();
    paintingPointer = event.pointerId;
    $("#pixel-grid").setPointerCapture(event.pointerId);
    paintPixel(button);
    button.focus({ preventScroll: true });
  });
  $("#pixel-grid").addEventListener("pointermove", event => {
    if (paintingPointer !== event.pointerId) return;
    const button = document.elementFromPoint(event.clientX, event.clientY)?.closest("#pixel-grid [data-pixel]");
    paintPixel(button);
  });
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    $("#pixel-grid").addEventListener(eventName, () => { paintingPointer = null; });
  }
  $("#pixel-grid").addEventListener("focusin", event => {
    document.querySelectorAll("[data-pixel]").forEach(button => { button.tabIndex = button === event.target ? 0 : -1; });
  });
  $("#pixel-grid").addEventListener("keydown", event => {
    const button = event.target.closest("[data-pixel]");
    if (!button) return;
    const index = Number(button.dataset.pixel);
    const deltas = { ArrowRight: index % 12 < 11 ? 1 : 0, ArrowLeft: index % 12 ? -1 : 0, ArrowUp: -12, ArrowDown: 12 };
    if (!(event.key in deltas)) return;
    event.preventDefault();
    const next = index + deltas[event.key];
    if (next >= 0 && next < 144) document.querySelector('[data-pixel="' + next + '"]').focus({ preventScroll: true });
  });
  $("#update-form").addEventListener("submit", submitForm);
  $("#form-close").addEventListener("click", () => { if (!busy) closeForm("Closed without saving"); });
  $("#form-cancel").addEventListener("click", () => { if (!busy) closeForm("Closed without saving"); });
  $("#update-dialog").addEventListener("cancel", event => {
    event.preventDefault();
    if (!busy) closeForm("Closed without saving");
  });
  $("#employee-select").addEventListener("change", renderEmployee);
  document.addEventListener("click", event => {
    const formButton = event.target.closest("[data-open-form]");
    if (formButton) openForm(formButton.dataset.openForm, Number(formButton.dataset.index), formButton);
  });
  window.addEventListener("beforeunload", event => {
    if ((editing && (busy || Object.keys(formChanges()).length)) || characterChanged()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  refresh();
}());
