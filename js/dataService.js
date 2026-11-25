(function () {
  "use strict";

  const key = "gse-galaxy-progress-v1:" + new URL("../", document.currentScript.src).pathname;
  const competencyGroups = {
    "FOUNDATION": ["Electronics Fundamentals", "Measurement Fundamentals"],
    "PROGRAMMING & DAQ": ["LabVIEW", "DAQ with FlexLogger", "DAQmx with LabVIEW"],
    "PXI & MODULAR INSTRUMENTS": ["PXI Chassis and Controller", "PXI SMU", "PXI FGEN", "PXI SCOPE"],
    "SOFTWARE": ["DIAdem", "TestStand", "SystemLink"],
    "EMBEDDED": ["CompactRIO"],
    "RF": ["SDR and RF Fundamentals"]
  };
  const names = Object.values(competencyGroups).flat();
  const demo = new Set([...competencyGroups["PROGRAMMING & DAQ"], ...competencyGroups["PXI & MODULAR INSTRUMENTS"],
    "TestStand", "SystemLink", "CompactRIO"]);
  const maxLevels = Object.fromEntries(names.map(name => [name, demo.has(name) ? 3 : 2]));
  const editable = {
    competencies: ["Level", "TargetLevel", "Coach", "Comments"],
    learning: ["Status", "ContentURL", "SupplementalURL", "Notes"]
  };
  const employees = ["Demo Explorer 1", "Demo Explorer 2"].map((name, index) => ({
    EmployeeID: "DEMO-" + (index + 1), EmployeeName: name, Manager: "Demo coach",
    Country: "Not set", CurrentWeek: 1, Status: "Demo"
  }));

  function starterData() {
    return {
      revision: 0,
      competencies: employees.flatMap(({ EmployeeID }) => names.map(Competency => ({
        EmployeeID, Competency, Level: 0, TargetLevel: maxLevels[Competency], LastAssessment: "", Coach: "", Comments: ""
      }))),
      learning: employees.flatMap(({ EmployeeID }) => names.map(Competency => ({
        EmployeeID, Competency, Module: Competency + " learning resources", Status: "Not Started",
        ContentURL: "https://learn.ni.com/", SupplementalURL: "https://www.ni.com/en/search.html?q=" +
          encodeURIComponent(Competency), Notes: ""
      })))
    };
  }

  function read() {
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch (error) {
      throw new Error("Cannot read progress. Allow browser storage for this site and try again.", { cause: error });
    }
    if (raw === null) return starterData();
    let model;
    try {
      model = JSON.parse(raw);
    } catch (error) {
      throw new Error("Saved progress could not be read. Browser data was not overwritten.", { cause: error });
    }
    if (!model || !Number.isSafeInteger(model.revision) || !Array.isArray(model.competencies) ||
        !Array.isArray(model.learning)) {
      throw new Error("Saved progress has an unrecognized format. Browser data was not overwritten.");
    }
    return model;
  }

  function present(model) {
    return { ...model, employees, competencyGroups, maxLevels };
  }

  function validate(field, value, competency) {
    if (field === "Level" || field === "TargetLevel") {
      const minimum = field === "Level" ? 0 : 1;
      if (!Number.isInteger(value) || value < minimum || value > maxLevels[competency]) {
        throw new Error(field + " must be a whole number from " + minimum + " to " + maxLevels[competency] + ".");
      }
      return;
    }
    if (field === "Status") {
      if (!["Not Started", "In Progress", "Completed"].includes(value)) throw new Error("Invalid learning status.");
      return;
    }
    if (field === "ContentURL" || field === "SupplementalURL") {
      if (value === "") return;
      if (typeof value !== "string" || value.length > 2000 || !/^https?:\/\/[^\s\\]+$/i.test(value) ||
          !URL.canParse(value)) throw new Error("Enter a valid HTTP or HTTPS learning link.");
      return;
    }
    if (typeof value !== "string" || value.length > 4000) throw new Error(field + " must be text of at most 4,000 characters.");
  }

  async function save(revision, { collection, EmployeeID, Competency, Module, changes }) {
    const model = read();
    if (revision !== model.revision) throw new Error("Progress changed in another tab. Refresh and reapply your edits.");
    if (!Object.hasOwn(editable, collection)) throw new Error("Unknown progress record type.");
    const row = model[collection].find(item => item.EmployeeID === EmployeeID && item.Competency === Competency &&
      (collection !== "learning" || item.Module === Module));
    if (!row) throw new Error("This progress record could not be found.");
    for (const [field, value] of Object.entries(changes)) {
      if (!editable[collection].includes(field)) throw new Error("This field is not editable: " + field);
      validate(field, value, Competency);
    }
    if (Object.hasOwn(changes, "Level") || Object.hasOwn(changes, "TargetLevel")) {
      row.LastAssessment = new Date().toISOString().slice(0, 10);
    }
    Object.assign(row, changes);
    model.revision += 1;
    try {
      localStorage.setItem(key, JSON.stringify(model));
    } catch (error) {
      throw new Error("Could not save progress. Check that browser storage is enabled and has space.", { cause: error });
    }
    return present(model);
  }

  window.GSEDataService = { load: async () => present(read()), save };
}());
