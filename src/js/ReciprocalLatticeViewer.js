import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { gsap } from "gsap";
import { MeshLine, MeshLineMaterial } from 'three.meshline';

export class ReciprocalLatticeViewer {
  constructor(exptParser, reflParser, standalone, colors = null) {

    /*
     * if isStandalone, the user can add and remove .expt and .refl files
     * manually
     */
    this.isStandalone = standalone;

    this.serverWS = null;

    this.colors = null;
    if (colors != null) {
      this.colors = colors;
    }
    else {
      this.colors = ReciprocalLatticeViewer.defaultColors();
    }

    // Data parsers
    this.expt = exptParser;
    this.refl = reflParser;

    // Html elements
    this.headerText = window.document.getElementById("headerText");
    this.sidebar = window.document.getElementById("sidebar");
    this.closeExptButton = document.getElementById("closeExpt");
    this.closeReflButton = document.getElementById("closeRefl");
    this.observedIndexedReflsCheckbox = document.getElementById("observedIndexedReflections");
    this.observedUnindexedReflsCheckbox = document.getElementById("observedUnindexedReflections");
    this.calculatedReflsCheckbox = document.getElementById("calculatedReflections");
    this.integratedReflsCheckbox = document.getElementById("integratedReflections");
    this.reciprocalCellCheckbox = document.getElementById("reciprocalCell");
    this.reflectionSize = document.getElementById("reflectionSize");

    // Bookkeeping for meshes
    this.reflPointsObsUnindexed = [];
    this.reflPositionsUnindexed = [];
    this.reflPointsObsIndexed = [];
    this.reflPositionsIndexed = [];
    this.reflPointsCal = [];
    this.reflPositionsCal = []
    this.reflPointsIntegrated = [];
    this.reflPositionsIntegrated = [];
    this.beamMeshes = [];
    this.sampleMesh = null;
    this.reciprocalCellMeshes = [];
    this.visibleExpts = [];
    this.visibleCrystalIDs = {};
    this.crystalView = false;

    this.crystalPositionsIndexed = {};
    this.crystalPointsIndexed = {};
    this.crystalPositionsCal = {};
    this.crystalPointsCal = {};
    this.crystalPositionsIntegrated = {};
    this.crystalPointsIntegrated = {};

    this.preventMouseClick = false;

    // Colors that are used often
    this.hightlightColor = new THREE.Color(this.colors["highlight"]);
    this.reflectionUnindexedColor = new THREE.Color(this.colors["reflectionObsUnindexed"]);
    this.reflectionInexedColor = new THREE.Color(this.colors["reflectionObsIndexed"]);
    this.reflectionCalculatedColor = new THREE.Color(this.colors["reflectionCal"]);

    this.rlpScaleFactor = 1000;
    this.reflSprite = new THREE.TextureLoader().load("resources/disc.png");

    this.displayingTextFromHTMLEvent = false;

    this.updateReflectionCheckboxStatus();
    this.setDefaultReflectionsDisplay();

  }

  static defaultColors() {
    return {
      "background": 0x222222,
      "sample": 0xfdf6e3,
      "reflectionObsUnindexed": [
        0x96f97b,
        0x75bbfd,
        0xbf77f6,
        0x13eac9,
        0xffb07c,
        0xffd1df,
        0xd0fefe,
        0xffff84,
        0xffffff,
        0xff9408,
        0x01f9c6,
        0xaefd6c,
        0xfe0002,
        0x990f4b,
        0x78d1b6,
        0xfff917,
        0xff0789,
        0xd4ffff,
        0x69d84f,
        0x56ae57
      ],
      "reflectionCrystalIndexed": [
        0x96f97b,
        0x75bbfd,
        0xbf77f6,
        0x13eac9,
        0xffb07c,
        0xffd1df,
        0xd0fefe,
        0xffff84,
        0xffffff,
        0xff9408,
        0x01f9c6,
        0xaefd6c,
        0xfe0002,
        0x990f4b,
        0x78d1b6,
        0xfff917,
        0xff0789,
        0xd4ffff,
        0x69d84f,
        0x56ae57
      ],
      "reflectionObsIndexed": 0xe74c3c,
			"reflectionCrystalUnindexed": 0x6a7688,
      "reflectionCal": 0xffaaaa,
			"reflectionIntegrated" : 0xffc25c,
      "highlight": 0xFFFFFF,
      "beam": 0xFFFFFF,
      "reciprocalCell": 0xFFFFFF,
      "RLVLabels": "white"
    };
  }

  static sizes() {
    return {
      "minRLVLineWidth": 1,
      "maxRLVLineWidth": 8,
      "minRLVLabelSize": 12,
      "beamLength": 800.,
      "sample": 1,
      "RLVLineWidthScaleFactor": 15,
      "RLVLabelScaleFactor": 7
    };
  }

  static cameraPositions() {
    return {
      "default": new THREE.Vector3(0, 0, -1000),
      "defaultWithExperiment": new THREE.Vector3(-1000, 0, 0),
      "centre": new THREE.Vector3(0, 0, 0)
    };
  }

  static text() {
    return {
      "default": "To view an experiment, drag .expt and .refl files into the browser",
      "defaultWithExpt": null
    }
  }

  toggleSidebar() {
    this.sidebar.style.display = this.sidebar.style.display === 'block' ? 'none' : 'block';
  }

  showSidebar() {
    this.sidebar.style.display = 'block';
  }

  updateObservedIndexedReflections(val = null) {
    if (val !== null) {
      this.observedIndexedReflsCheckbox.checked = val;
    }
    for (var i = 0; i < this.reflPointsObsIndexed.length; i++){
      this.reflPointsObsIndexed[i][0].visible = this.observedIndexedReflsCheckbox.checked && this.visibleExpts[i] && !this.crystalView;
    }
    this.requestRender();
  }

  updateObservedUnindexedReflections(val = null) {
    if (val !== null) {
      this.observedUnindexedReflsCheckbox.checked = val;
    }
    for (var i = 0; i < this.reflPointsObsUnindexed.length; i++){
      this.reflPointsObsUnindexed[i][0].visible = this.observedUnindexedReflsCheckbox.checked && this.visibleExpts[i] && !this.crystalView;
    }
    this.requestRender();
  }

  updateCalculatedReflections(val = null) {
    if (val !== null) {
      this.calculatedReflsCheckbox.checked = val;
    }
    for (var i = 0; i < this.reflPointsCal.length; i++){
      this.reflPointsCal[i][0].visible = this.calculatedReflsCheckbox.checked && this.visibleExpts[i] && !this.crystalView; 
      this.requestRender();
    }
  }

  updateIntegratedReflections(val = null) {
    if (val !== null) {
      this.integratedReflsCheckbox.checked = val;
    }
    for (var i = 0; i < this.reflPointsIntegrated.length; i++){
      this.reflPointsIntegrated[i][0].visible = this.integratedReflsCheckbox.checked && this.visibleExpts[i] && !this.crystalView;
      this.requestRender();
    }
  }

  updateCrystalIndexedReflections(val = null) {
    if (val !== null) {
      this.observedIndexedReflsCheckbox.checked = val;
    }
    const crystalIDs = Object.keys(this.crystalPointsIndexed);
    for (const i of crystalIDs){
      if (!this.crystalView){
        this.crystalPointsIndexed[i].visible = false;
        continue;
      }
      if (i === "-1"){
        this.crystalPointsIndexed[i].visible = this.observedUnindexedReflsCheckbox.checked && this.visibleCrystalIDs[i] && this.crystalView;
      }
      else{
        this.crystalPointsIndexed[i].visible = this.observedIndexedReflsCheckbox.checked && this.visibleCrystalIDs[i] && this.crystalView;
      }
    }
    this.requestRender();
  }

  updateCrystalCalculatedReflections(val = null) {
    if (val !== null) {
      this.calculatedReflsCheckbox.checked = val;
    }
    const crystalIDs = Object.keys(this.crystalPointsCal);
    for (const i of crystalIDs){
      if (!this.crystalView){
        this.crystalPointsCal[i].visible = false;
        continue;
      }
      this.crystalPointsCal[i].visible = this.calculatedReflsCheckbox.checked && this.visibleCrystalIDs[i] && this.crystalView;
    }
    this.requestRender();
  }

  updateCrystalIntegratedReflections(val = null) {
    if (val !== null) {
      this.integratedReflsCheckbox.checked = val;
    }
    const crystalIDs = Object.keys(this.crystalPointsIntegrated);
    for (const i of crystalIDs){
      if (!this.crystalView){
        this.crystalPointsIntegrated[i].visible = false;
        continue;
      }
      this.crystalPointsIntegrated[i].visible = this.integratedReflsCheckbox.checked && this.visibleCrystalIDs[i] && this.crystalView;
    }
    this.requestRender();
  }

  switchToCrystalView(){
    this.crystalView = true;
    const dropdownButton = document.getElementById('experimentDropdownButton');
    dropdownButton.innerHTML = `<b>${"Crystals"}</b> <i class="fa fa-chevron-right" id="dropdownIcon"></i>`;
    this.updateCrystalDropdown();
    this.updateReflectionVisibility();
    this.updateCrystalRLV();
  }

  switchToOrientationView(){
    this.crystalView = false;
    const dropdownButton = document.getElementById('experimentDropdownButton');
    dropdownButton.innerHTML = `<b>${"Orientations"}</b> <i class="fa fa-chevron-right" id="dropdownIcon"></i>`;
    this.updateExperimentList();
    this.updateReflectionVisibility();
    this.updateCrystalRLV();
    Object.keys(this.visibleCrystalIDs).forEach(key => {this.visibleCrystalIDs[key] = true;});
    this.updateReciprocalCell();
  }

  updateReciprocalCell(val = null, focusOnCell = false) {
    this.reciprocalCellCheckbox.disabled = !this.expt.hasCrystal(0);
    if (val !== null) {
      this.reciprocalCellCheckbox.checked = val;
    }
    for (var i = 0; i < this.reciprocalCellMeshes.length; i++) {
      const visibility = this.reciprocalCellCheckbox.checked && this.visibleCrystalIDs[i];
      for (var j = 0; j < this.reciprocalCellMeshes[i].length; j++){
        this.reciprocalCellMeshes[i][j].visible = visibility;
      }
    }
    if (this.reciprocalCellCheckbox.checked && focusOnCell) {
      this.zoomInOnObject(this.reciprocalCellMeshes[0][0]);
    }
    this.requestRender();
  }

  updateReflectionSize() {
    if (!this.hasReflectionTable()) {
      return;
    }

    // Unindexed
    if (this.refl.hasXYZObsData()) {
      if (this.reflPositionsUnindexed) {
        const reflPointsObsUnindexed = [];

        for (var i = 0; i < this.reflPositionsUnindexed.length; i++){
          reflPointsObsUnindexed.push(
            [this.createPoints(
              this.reflPositionsUnindexed[i],
              this.colors["reflectionObsUnindexed"][i % this.colors["reflectionObsUnindexed"].length],
              this.reflectionSize.value
            )]
          );
        }

        this.clearReflPointsObsUnindexed();
        for (var p = 0; p < reflPointsObsUnindexed.length; p++){
          window.scene.add(reflPointsObsUnindexed[p][0]);
        }
        this.reflPointsObsUnindexed = reflPointsObsUnindexed;
        this.updateObservedUnindexedReflections();
      }

      // Indexed
      if (this.reflPositionsIndexed) {
        const reflPointsObsIndexed = [];

        for (var i = 0; i < this.reflPositionsIndexed.length; i++){
          reflPointsObsIndexed.push(
            [this.createPoints(
              this.reflPositionsIndexed[i],
              this.colors["reflectionObsIndexed"],
              this.reflectionSize.value
            )]
          );
        }
        this.clearReflPointsObsIndexed();
        for (var p = 0; p < reflPointsObsIndexed.length; p++){
          window.scene.add(reflPointsObsIndexed[p][0]);
        }
        this.reflPointsObsIndexed = reflPointsObsIndexed;
        this.updateObservedIndexedReflections();
      }

      if (this.crystalPositionsIndexed){
        const crystalIDs = Object.keys(this.crystalPositionsIndexed)
        const crystalPointsIndexed = {}
        for (let ci = 0; ci < crystalIDs.length; ci++){
          const crystalID = crystalIDs[ci];
          if (crystalID === "-1"){
            const points = this.createPoints(
                this.crystalPositionsIndexed[crystalID],
                this.colors["reflectionCrystalUnindexed"],
                this.reflectionSize.value,
              );
            points.name = crystalID.toString();
            crystalPointsIndexed[crystalID] = points;
          }
          else{
            const points = this.createPoints(
                this.crystalPositionsIndexed[crystalID],
                this.colors["reflectionCrystalIndexed"][crystalID % this.colors["reflectionCrystalIndexed"].length],
                this.reflectionSize.value,
              );
            points.name = crystalID.toString();
            crystalPointsIndexed[crystalID] = points;
            window.scene.add(points);
          }
        }
        this.clearCrystalReflPointsIndexed();
        for (let ci = 0; ci < crystalIDs.length; ci++){
          const crystalID = crystalIDs[ci];
          window.scene.add(crystalPointsIndexed[crystalID]);
        }
        this.crystalPointsIndexed = crystalPointsIndexed;
        this.updateCrystalIndexedReflections();
      }
    }

    // Calculated
    if (this.refl.hasXYZCalData() && this.reflPositionsCal) {
      const reflPointsCal = [];
      for (var i = 0; i < this.reflPositionsCal.length; i++){
        const pointsCal = this.createPoints(
          this.reflPositionsCal[i],
          this.colors["reflectionCal"],
          this.reflectionSize.value
        );
        reflPointsCal.push([pointsCal]);

      }
      this.clearReflPointsCal();
      for (var p = 0; p < reflPointsCal.length; p++){
        window.scene.add(reflPointsCal[p][0]);
      }
      this.reflPointsCal = reflPointsCal;
      this.updateCalculatedReflections();

      if (this.crystalPositionsCal){
        const crystalPointsCal = {}
        const crystalIDs = Object.keys(this.crystalPositionsCal)
        for (let ci = 0; ci < crystalIDs.length; ci++){
          const crystalID = crystalIDs[ci];
          const points = this.createPoints(
              this.crystalPositionsCal[crystalID],
              this.colors["reflectionCal"],
              this.reflectionSize.value,
            );
          points.name = crystalID.toString();
          crystalPointsCal[crystalID] = points;
        }
        this.clearCrystalReflPointsCal();
        for (let ci = 0; ci < crystalIDs.length; ci++){
          const crystalID = crystalIDs[ci];
          window.scene.add(crystalPointsCal[crystalID]);
        }
        this.crystalPointsCal = crystalPointsCal;
        this.updateCrystalCalculatedReflections();
      }
      
      // Integrated
      if (this.reflPointsIntegrated){
        const reflPointsIntegrated = [];
        for (var i = 0; i < this.reflPositionsIntegrated.length; i++){
          const pointsIntegrated = this.createPoints(
            this.reflPositionsIntegrated[i],
            this.colors["reflectionIntegrated"],
            this.reflectionSize.value
          );
          reflPointsIntegrated.push([pointsIntegrated]);
        }
        this.clearReflPointsIntegrated();
        for (var p = 0; p < reflPointsIntegrated.length; p++){
          window.scene.add(reflPointsIntegrated[p][0]);
        }
        this.reflPointsIntegrated = reflPointsIntegrated;
        this.updateIntegratedReflections();

        if (this.crystalPointsIntegrated){
          const crystalPointsIntegrated = {};
          const crystalIDs = Object.keys(this.crystalPositionsIntegrated)
          for (let ci = 0; ci < crystalIDs.length; ci++){
            const crystalID = crystalIDs[ci];
            const points = this.createPoints(
                this.crystalPositionsIntegrated[crystalID],
                this.colors["reflectionIntegrated"],
                this.reflectionSize.value,
              );
            points.name = crystalID.toString();
            crystalPointsIntegrated[crystalID] = points;
          }
          this.clearCrystalReflPointsIntegrated();
          for (let ci = 0; ci < crystalIDs.length; ci++){
            const crystalID = crystalIDs[ci];
            window.scene.add(crystalPointsIntegrated[crystalID]);
          }
          this.crystalPointsIntegrated = crystalPointsIntegrated;
        }

          
      }
    }
    this.requestRender();
  }

  getS1(point, dMatrix, wavelength, scaleFactor = [1, 1]) {
    const point3 = new THREE.Vector3(point[0] * scaleFactor[0], point[1] * scaleFactor[1], 1.0);
    point3.applyMatrix3(dMatrix);
    point3.normalize().multiplyScalar(1 / wavelength);
    return point3;
  }

  hasExperiment() {
    return (this.expt.hasExptJSON());
  }

  clearExperiment() {

    for (var i = 0; i < this.beamMeshes.length; i++) {
      window.scene.remove(this.beamMeshes[i]);
      this.beamMeshes[i].geometry.dispose();
      this.beamMeshes[i].material.dispose();
    }
    this.beamMeshes = [];
    this.clearCrystalRLV();
    if (this.sampleMesh) {
      window.scene.remove(this.sampleMesh);
      this.sampleMesh.geometry.dispose();
      this.sampleMesh.material.dispose();
      this.sampleMesh = null;
    }

    this.expt.clearExperiment();
    this.hideCloseExptButton();

    this.clearReflectionTable();
    this.updateReciprocalCell(false);
    this.clearExperimentList();
    this.requestRender();
  }

  addExperiment = async (file) => {
    this.clearExperiment();
    this.clearReflectionTable();
    await this.expt.parseExperiment(file);
    console.assert(this.hasExperiment());
    this.addBeam();
    this.addSample();
    this.addCrystalRLV();
    this.updateReciprocalCell();
    this.setCameraToDefaultPositionWithExperiment();
    this.showSidebar();
    if (this.isStandalone) {
      this.showCloseExptButton();
    }
    this.updateExperimentList();
    this.requestRender();

  }

  addExperimentFromJSONString = async (
    jsonString,
    defaultSetup = true,
    showReciprocalCell = false) => {

    this.clearExperiment();
    this.clearReflectionTable();
    await this.expt.parseExperimentJSON(jsonString);
    console.assert(this.hasExperiment());
    this.addBeam();
    this.addSample();
    this.addCrystalRLV();
    if (defaultSetup) {
      this.updateReciprocalCell(showReciprocalCell);
      this.setCameraToDefaultPositionWithExperiment();
      this.showSidebar();
    }
    else {
      this.updateReciprocalCell(showReciprocalCell, false);
    }
    if (this.isStandalone) {
      this.showCloseExptButton();
    }
    this.updateExperimentList();
    this.requestRender();
  }

  showCloseExptButton() {
    this.closeExptButton.style.display = "inline";
    this.closeExptButton.innerHTML = "<b>" + this.expt.filename + ' <i class="fa fa-trash"></i>';
  }

  hideCloseExptButton() {
    this.closeExptButton.style.display = "none";
  }

  hasReflectionTable() {
    return (this.refl.hasReflTable());
  }

  clearReflPointsObsIndexed() {
    for (var i = 0; i < this.reflPointsObsIndexed.length; i++) {
      window.scene.remove(this.reflPointsObsIndexed[i][0]);
      this.reflPointsObsIndexed[i][0].geometry.dispose();
      this.reflPointsObsIndexed[i][0].material.dispose();
    }
    this.reflPointsObsIndexed = [];
  }

  clearReflPointsObsUnindexed() {
    for (var i = 0; i < this.reflPointsObsUnindexed.length; i++) {
      window.scene.remove(this.reflPointsObsUnindexed[i][0]);
      this.reflPointsObsUnindexed[i][0].geometry.dispose();
      this.reflPointsObsUnindexed[i][0].material.dispose();
    }
    this.reflPointsObsUnindexed = [];
  }

  clearReflPointsCal() {
    for (var i = 0; i < this.reflPointsCal.length; i++) {
      window.scene.remove(this.reflPointsCal[i][0]);
      this.reflPointsCal[i][0].geometry.dispose();
      this.reflPointsCal[i][0].material.dispose();
    }
    this.reflPointsCal = [];
  }

  clearReflPointsIntegrated() {
    for (var i = 0; i < this.reflPointsIntegrated.length; i++) {
      window.scene.remove(this.reflPointsIntegrated[i][0]);
      this.reflPointsIntegrated[i][0].geometry.dispose();
      this.reflPointsIntegrated[i][0].material.dispose();
    }
    this.reflPointsIntegrated = [];
  }

  clearCrystalReflPointsIndexed(){
    if (!this.crystalPointsIndexed){
      return;
    }
    const crystalIDs = Object.keys(this.crystalPointsIndexed);
    for (const i of crystalIDs){
      window.scene.remove(this.crystalPointsIndexed[i]);
      this.crystalPointsIndexed[i].geometry.dispose();
      this.crystalPointsIndexed[i].material.dispose();
    }
    this.crystalPointsIndexed = {};
  }

  clearCrystalReflPointsCal(){
    if (!this.crystalPointsCal){
      return;
    }
    const crystalIDs = Object.keys(this.crystalPointsCal);
    for (const i of crystalIDs){
      window.scene.remove(this.crystalPointsCal[i]);
      this.crystalPointsCal[i].geometry.dispose();
      this.crystalPointsCal[i].material.dispose();
    }
    this.crystalPointsCal = {};
  }

  clearCrystalReflPointsIntegrated(){
    if (!this.crystalPointsIntegrated){
      return;
    }
    const crystalIDs = Object.keys(this.crystalPointsIntegrated);
    for (const i of crystalIDs){
      window.scene.remove(this.crystalPointsIntegrated[i]);
      this.crystalPointsIntegrated[i].geometry.dispose();
      this.crystalPointsIntegrated[i].material.dispose();
    }
    this.crystalPointsIntegrated = {};
  }

  clearReflectionTable() {
    this.clearReflPointsObsIndexed();
    this.clearReflPointsObsUnindexed();
    this.clearReflPointsCal();
    this.clearReflPointsIntegrated();
    this.clearCrystalReflPointsIndexed();
    this.clearCrystalReflPointsCal();
    this.clearCrystalReflPointsIntegrated();
    this.refl.clearReflectionTable();
    this.updateReflectionCheckboxStatus();
    this.setDefaultReflectionsDisplay();
    this.hideCloseReflButton();
    this.requestRender();
  }

  createPoints(positions, color, size) {
    const reflGeometry = new THREE.BufferGeometry();
    reflGeometry.setAttribute(
      "position", new THREE.Float32BufferAttribute(positions, 3)
    );

    const reflMaterial = new THREE.PointsMaterial({
      size: size,
      map: this.reflSprite,
      alphaTest: 0.5,
      transparent: true,
      color: color
    });
    return new THREE.Points(reflGeometry, reflMaterial);
  }

  showCloseReflButton() {
    this.closeReflButton.style.display = "inline";
    this.closeReflButton.innerHTML = "<b>" + this.refl.filename + ' <i class="fa fa-trash"></i>';
  }

  hideCloseReflButton() {
    this.closeReflButton.style.display = "none";
  }

  addReflectionTable = async (file) => {
    this.clearReflectionTable();
    await this.refl.parseReflectionTable(file);
    this.addReflections();
    if (this.hasReflectionTable() && this.isStandalone) {
      this.showCloseReflButton();
    }
    this.requestRender();
  }

  addReflectionsFromData(reflData) {

    function getRLP(s1, wavelength, unitS0, viewer, goniometer, angle, U, addAnglesToReflections) {

      const rlp = s1.clone().normalize().sub(unitS0.clone().normalize()).multiplyScalar(1 / wavelength);

      if (!addAnglesToReflections) {
        return rlp.multiplyScalar(viewer.rlpScaleFactor);
      }
      if (angle == null) {
        console.warn("Rotation angles not in reflection table. Cannot generate rlps correctly if rotation experiment.");
        return rlp.multiplyScalar(viewer.rlpScaleFactor);
      }
      var fixedRotation = goniometer["fixedRotation"];
      const settingRotation = goniometer["settingRotation"];
      const rotationAxis = goniometer["rotationAxis"];

      //fixedRotation = fixedRotation.clone().multiply(U);
      rlp.applyMatrix3(settingRotation.clone().invert());
      rlp.applyAxisAngle(rotationAxis, -angle);
      rlp.applyMatrix3(fixedRotation.clone().invert().transpose());
      return rlp.multiplyScalar(viewer.rlpScaleFactor);
    }

    this.clearReflectionTable();
    if (!this.hasExperiment()) {
      console.warn("Tried to add reflections but no experiment has been loaded");
      return;
    }

    this.refl.panelReflData = reflData;
    this.refl.reflTable = "reflData";

    const panelKeys = Object.keys(reflData);
    const refl = reflData[panelKeys[0]][0];

    const containsXYZObs = "xyzObs" in refl;
    const containsXYZCal = "xyzCal" in refl;
    const containsMillerIndices = "millerIdx" in refl;
    const containsWavelengths = "wavelength" in refl;
    const containsWavelengthsCal = "wavelengthCal" in refl;
    const containsCrystalIDs = "crystalID" in refl;

    const pointsObsUnindexed = [];
    const positionsObsUnindexed = [];
    const positionsObsIndexed = [];
    const pointsObsIndexed = [];
    const crystalPositionsIndexed = {};
    const crystalPointsIndexed = {};
    const positionsCal = [];
    const pointsCal = [];
    const crystalPositionsCal = {};
    const crystalPointsCal = {};
    const positionsIntegrated = [];
    const pointsIntegrated = [];
    const crystalPositionsIntegrated = {};
    const crystalPointsIntegrated = {};

    for (var i = 0; i < this.expt.numExperiments(); i++){
      pointsObsUnindexed.push([]);
      positionsObsUnindexed.push([]);
      positionsObsIndexed.push([]);
      pointsObsIndexed.push([]);
      positionsCal.push([]);
      pointsCal.push([]);
      positionsIntegrated.push([]);
      pointsIntegrated.push([]);
    }
    
    var scan = this.expt.scan;
    const addAnglesToReflections = (goniometer !== null && scan !== null);

    for (var i = 0; i < panelKeys.length; i++) {
      const panelIdx = parseInt(panelKeys[i]);

      var panelReflections = reflData[panelKeys[i]];
      if (panelReflections === undefined){continue;}
      const panelData = this.expt.getDetectorPanelDataByIdx(0, panelIdx);

      if (addAnglesToReflections) {
        panelReflections = this.expt.addAnglesToReflections(panelReflections);
      }

      const pxSize = [panelData["pxSize"].x, panelData["pxSize"].y];
      const dMatrix = panelData["dMatrix"];
      var U = null;
      if (this.expt.hasCrystal(0)) {
        U = this.expt.getCrystalU(0);
      }

      for (var j = 0; j < panelReflections.length; j++) {
        const exptID = panelReflections[j]["exptID"];
        var wavelength = this.expt.getBeamData(exptID)["wavelength"];
        var wavelengthCal = this.expt.getBeamData(exptID)["wavelength"];
        var unitS0 = this.expt.getBeamDirection(exptID).multiplyScalar(-1).normalize();
        var goniometer = this.expt.experiments[exptID].goniometer;

        if (containsXYZObs) {

          const xyzObs = panelReflections[j]["xyzObs"];

          if (containsWavelengths) {
            wavelength = panelReflections[j]["wavelength"];
          }
          if (!wavelength) {
            continue;
          }
          const s1 = this.getS1(xyzObs, dMatrix, wavelength, pxSize);
          const angle = panelReflections[j]["angleObs"];
          const rlp = getRLP(s1, wavelength, unitS0, this, goniometer, angle, U, addAnglesToReflections);

          if (containsMillerIndices && panelReflections[j]["indexed"]) {
            positionsObsIndexed[exptID].push(rlp.x);
            positionsObsIndexed[exptID].push(rlp.y);
            positionsObsIndexed[exptID].push(rlp.z);
          }
          else {
            positionsObsUnindexed[exptID].push(rlp.x);
            positionsObsUnindexed[exptID].push(rlp.y);
            positionsObsUnindexed[exptID].push(rlp.z);
          }

          if (containsCrystalIDs){
            const crystalID = panelReflections[j]["crystalID"];
            if (!(crystalID in crystalPositionsIndexed)){
              crystalPositionsIndexed[crystalID] = [];
            }
            crystalPositionsIndexed[crystalID].push(rlp.x);
            crystalPositionsIndexed[crystalID].push(rlp.y);
            crystalPositionsIndexed[crystalID].push(rlp.z);
          }
        }

        if (containsXYZCal) {
          const xyzCal = panelReflections[j]["xyzCal"];
          if (containsWavelengthsCal) {
            wavelengthCal = panelReflections[j]["wavelengthCal"];
          }
          if (!wavelengthCal) {
            continue;
          }
          const s1 = this.getS1(xyzCal, dMatrix, wavelengthCal, pxSize);
          const angle = panelReflections[j]["angleCal"];
          const rlp = getRLP(s1, wavelengthCal, unitS0, this, goniometer, angle, U, addAnglesToReflections);
          positionsCal[exptID].push(rlp.x);
          positionsCal[exptID].push(rlp.y);
          positionsCal[exptID].push(rlp.z);

          if (containsCrystalIDs){
            const crystalID = panelReflections[j]["crystalID"];
            if (!(crystalID in crystalPositionsCal)){
              crystalPositionsCal[crystalID] = [];
            }
            crystalPositionsCal[crystalID].push(rlp.x);
            crystalPositionsCal[crystalID].push(rlp.y);
            crystalPositionsCal[crystalID].push(rlp.z);
          }

          if ("summedIntensity" in panelReflections[j]) {
            positionsIntegrated[exptID].push(rlp.x);
            positionsIntegrated[exptID].push(rlp.y);
            positionsIntegrated[exptID].push(rlp.z);
            if (containsCrystalIDs){
              const crystalID = panelReflections[j]["crystalID"];
              if (!(crystalID in crystalPositionsIntegrated)){
                crystalPositionsIntegrated[crystalID] = [];
              }
              crystalPositionsIntegrated[crystalID].push(rlp.x);
              crystalPositionsIntegrated[crystalID].push(rlp.y);
              crystalPositionsIntegrated[crystalID].push(rlp.z);
            }
          }

        }
      }
    }

    // Now create actual sprites
    // Observed spots
    if (containsXYZObs) {

      // Indexed spots
      if (containsMillerIndices) {

        for (var exptID = 0; exptID < positionsObsIndexed.length; exptID++){
          pointsObsIndexed[exptID].push(
            this.createPoints(
              positionsObsIndexed[exptID],
              this.colors["reflectionObsIndexed"],
              this.reflectionSize.value
            )
          );
        }

        for (var p = 0; p < pointsObsIndexed.length; p++){
          window.scene.add(pointsObsIndexed[p][0]);
        }
        this.reflPointsObsIndexed = pointsObsIndexed;
        this.reflPositionsIndexed = positionsObsIndexed;
      }

      // Unindexed spots
      for (var exptID = 0; exptID < positionsObsUnindexed.length; exptID++){
        const points = this.createPoints(
            positionsObsUnindexed[exptID],
            this.colors["reflectionObsUnindexed"][exptID % this.colors["reflectionObsUnindexed"].length],
            this.reflectionSize.value,
          );
          points.name = exptID.toString();
        pointsObsUnindexed[exptID].push(points);
        window.scene.add(points);
      }
      this.reflPointsObsUnindexed = pointsObsUnindexed;
      this.reflPositionsUnindexed = positionsObsUnindexed;

      const crystalIDs = Object.keys(crystalPositionsIndexed)
      for (let ci = 0; ci < crystalIDs.length; ci++){
        const crystalID = crystalIDs[ci];
        if (crystalID === "-1"){
          const points = this.createPoints(
              crystalPositionsIndexed[crystalID],
              this.colors["reflectionCrystalUnindexed"],
              this.reflectionSize.value,
            );
          points.name = crystalID.toString();
          crystalPointsIndexed[crystalID] = points;
          window.scene.add(points);
        }
        else{
          const points = this.createPoints(
              crystalPositionsIndexed[crystalID],
              this.colors["reflectionCrystalIndexed"][crystalID % this.colors["reflectionCrystalIndexed"].length],
              this.reflectionSize.value,
            );
          points.name = crystalID.toString();
          crystalPointsIndexed[crystalID] = points;
          window.scene.add(points);
        }
      }
      this.crystalPositionsIndexed = crystalPositionsIndexed;
      this.crystalPointsIndexed = crystalPointsIndexed;
    }

    // Calculated spots
    if (containsXYZCal) {
      for (var exptID = 0; exptID < positionsCal.length; exptID++){
        const points= this.createPoints(
          positionsCal[exptID],
          this.colors["reflectionCal"],
          this.reflectionSize.value
        );
        pointsCal[exptID].push(points);
      }
      for (var p = 0; p < pointsCal.length; p++){
        window.scene.add(pointsCal[p][0]);
      }
      this.reflPointsCal = pointsCal;
      this.reflPositionsCal = positionsCal;
      
      const crystalIDs = Object.keys(crystalPositionsCal)
      for (let ci = 0; ci < crystalIDs.length; ci++){
        const crystalID = crystalIDs[ci];
        const points = this.createPoints(
            crystalPositionsCal[crystalID],
            this.colors["reflectionCal"],
            this.reflectionSize.value,
          );
        points.name = crystalID.toString();
        crystalPointsCal[crystalID] = points;
        window.scene.add(points);
      }
      this.crystalPositionsCal = crystalPositionsCal;
      this.crystalPointsCal = crystalPointsCal;

      if (positionsIntegrated.length !== 0){
        for (var exptID = 0; exptID < positionsIntegrated.length; exptID++){
          const points= this.createPoints(
            positionsIntegrated[exptID],
            this.colors["reflectionIntegrated"],
            this.reflectionSize.value
          );
          pointsIntegrated[exptID].push(points);
        }
        for (var p = 0; p < pointsIntegrated.length; p++){
          window.scene.add(pointsIntegrated[p][0]);
        }
        this.reflPointsIntegrated = pointsIntegrated;
        this.reflPositionsIntegrated = positionsIntegrated;

        const crystalIDs = Object.keys(crystalPositionsIntegrated)
        for (let ci = 0; ci < crystalIDs.length; ci++){
          const crystalID = crystalIDs[ci];
          const points = this.createPoints(
              crystalPositionsIntegrated[crystalID],
              this.colors["reflectionIntegrated"],
              this.reflectionSize.value,
            );
          points.name = crystalID.toString();
          crystalPointsIntegrated[crystalID] = points;
          window.scene.add(points);
        }
        this.crystalPositionsIntegrated = crystalPositionsIntegrated;
        this.crystalPointsIntegrated = crystalPointsIntegrated;
          
      }
    }

    this.updateReflectionCheckboxStatus();
    this.setDefaultReflectionsDisplay();
    this.updateReflectionVisibility();
    this.requestRender();

  }

  addReflections() {

    function getRLP(s1, wavelength, unitS0, viewer, goniometer, angle, U) {

      const rlp = s1.clone().normalize().sub(unitS0.clone().normalize()).multiplyScalar(1 / wavelength);

      if (goniometer == null) {
        return rlp.multiplyScalar(viewer.rlpScaleFactor);
      }
      if (angle == null) {
        console.warn("Rotation angles not in reflection table. Cannot generate rlps correctly.");
        return rlp.multiplyScalar(viewer.rlpScaleFactor);
      }
      var fixedRotation = goniometer["fixedRotation"];
      const settingRotation = goniometer["settingRotation"];
      const rotationAxis = goniometer["rotationAxis"];

      //fixedRotation = fixedRotation.clone().multiply(U);
      rlp.applyMatrix3(settingRotation.clone().invert());
      rlp.applyAxisAngle(rotationAxis, -angle);
      rlp.applyMatrix3(fixedRotation.clone().invert().transpose());
      return rlp.multiplyScalar(viewer.rlpScaleFactor);
    }

    if (!this.hasExperiment()) {
      console.warn("Tried to add reflections but no experiment has been loaded");
      this.clearReflectionTable();
      return;
    }

    const containsXYZObs = this.refl.containsXYZObs();
    const containsXYZCal = this.refl.containsXYZCal();
    const containsMillerIndices = this.refl.containsMillerIndices();
    const containsWavelengths = this.refl.containsWavelengths();
    const containsWavelengthsCal = this.refl.containsWavelengthsCal();

    const pointsObsUnindexed = [];
    const positionsObsUnindexed = [];
    const positionsObsIndexed = [];
    const pointsObsIndexed = [];
    const positionsCal = [];


    for (var i = 0; i < this.expt.numExperiments(); i++){
      pointsObsUnindexed.push([]);
      positionsObsUnindexed.push([]);
      positionsObsIndexed.push([]);
      pointsObsIndexed.push([]);
    }

    for (var i = 0; i < this.expt.getNumDetectorPanels(0); i++) {

      var panelReflections = this.refl.getReflectionsForPanel(i);
      if (panelReflections == undefined){continue;}
      const panelData = this.expt.getDetectorPanelDataByIdx(0, i);

      if (goniometer !== null) {
        if (!this.refl.containsRotationAnglesObs() || !this.refl.containsRotationAnglesCal()) {
          panelReflections = this.expt.addAnglesToReflections(panelReflections);
        }
      }

      const pxSize = [panelData["pxSize"].x, panelData["pxSize"].y];
      const dMatrix = panelData["dMatrix"];
      var U = null;
      if (this.expt.hasCrystal(0)) {
        U = this.expt.getCrystalU(0);
      }

      for (var j = 0; j < panelReflections.length; j++) {
        const exptID = panelReflections[j]["exptID"];
        var wavelength = this.expt.getBeamData(exptID)["wavelength"];
        var wavelengthCal = this.expt.getBeamData(exptID)["wavelength"];
        var unitS0 = this.expt.getBeamDirection(exptID).multiplyScalar(-1).normalize();
        var goniometer = this.expt.experiments[exptID].goniometer;

        if (containsXYZObs) {

          const xyzObs = panelReflections[j]["xyzObs"];

          if (containsWavelengths) {
            wavelength = panelReflections[j]["wavelength"];
          }
          if (!wavelength) {
            continue;
          }
          const s1 = this.getS1(xyzObs, dMatrix, wavelength, pxSize);
          const angle = panelReflections[j]["angleObs"];
          const rlp = getRLP(s1, wavelength, unitS0, this, goniometer, angle, U);

          if (containsMillerIndices && panelReflections[j]["indexed"]) {
            positionsObsIndexed[exptID].push(rlp.x);
            positionsObsIndexed[exptID].push(rlp.y);
            positionsObsIndexed[exptID].push(rlp.z);
          }
          else {
            positionsObsUnindexed[exptID].push(rlp.x);
            positionsObsUnindexed[exptID].push(rlp.y);
            positionsObsUnindexed[exptID].push(rlp.z);
          }
        }
        if (containsXYZCal) {
          const xyzCal = panelReflections[j]["xyzCal"];
          if (containsWavelengthsCal) {
            wavelengthCal = panelReflections[j]["wavelengthCal"];
          }
          if (!wavelengthCal) {
            continue;
          }
          const s1 = this.getS1(xyzCal, dMatrix, wavelengthCal, pxSize);
          if (angle > 1){
            const angle = panelReflections[j]["angleCal"];
          }
          const rlp = getRLP(s1, wavelengthCal, unitS0, this, goniometer, angle, U);
          positionsCal.push(rlp.x);
          positionsCal.push(rlp.y);
          positionsCal.push(rlp.z);
        }
      }
    }

    if (containsXYZObs) {
      if (containsMillerIndices) {
        for (var exptID = 0; exptID < positionsObsIndexed.length; exptID++){
          pointsObsIndexed[exptID].push(
            this.createPoints(
              positionsObsIndexed[exptID],
              this.colors["reflectionObsIndexed"],
              this.reflectionSize.value
            )
          );
        }

        for (var p = 0; p < pointsObsIndexed.length; p++){
          window.scene.add(pointsObsIndexed[p][0]);
        }
        this.reflPointsObsIndexed = pointsObsIndexed;
        this.reflPositionsIndexed = positionsObsIndexed;

      }
      for (var exptID = 0; exptID < positionsObsUnindexed.length; exptID++){
        const points = this.createPoints(
            positionsObsUnindexed[exptID],
            this.colors["reflectionObsUnindexed"][exptID % this.colors["reflectionObsUnindexed"].length],
            this.reflectionSize.value,
          );
          points.name = exptID.toString();
        pointsObsUnindexed[exptID].push(points);
        window.scene.add(points);
      }

      this.reflPointsObsUnindexed = pointsObsUnindexed;
      this.reflPositionsUnindexed = positionsObsUnindexed;
    }

    if (containsXYZCal) {
      const pointsCal = this.createPoints(
        positionsCal,
        this.colors["reflectionCal"],
        this.reflectionSize.value
      );
      window.scene.add(pointsCal);
      this.reflPointsCal = [pointsCal];
      this.reflPositionsCal = positionsCal;
    }

    this.updateReflectionCheckboxStatus();
    this.setDefaultReflectionsDisplay();
  }

  setDefaultReflectionsDisplay() {

    this.observedIndexedReflsCheckbox.checked = false;
    this.observedUnindexedReflsCheckbox.checked = false;
    this.calculatedReflsCheckbox.checked = false;
    this.integratedReflsCheckbox.checked = false;
    if (!this.hasReflectionTable()) {
      return;
    }

    if (this.reflPointsObsUnindexed.length > 0) {
      this.observedUnindexedReflsCheckbox.checked = true;
    }
    if (this.reflPointsObsIndexed.length > 0) {
      this.observedIndexedReflsCheckbox.checked = true;
    }
  }
  
  updateReflectionVisibility(){
    this.updateObservedIndexedReflections();
    this.updateObservedUnindexedReflections();
    this.updateCalculatedReflections();
    this.updateIntegratedReflections();
    this.updateCrystalIndexedReflections();
    this.updateCrystalCalculatedReflections();
    this.updateCrystalIntegratedReflections();
    this.requestRender();
  }

  updateReflectionCheckboxStatus() {
    if (!this.hasReflectionTable()) {
      this.observedIndexedReflsCheckbox.disabled = true;
      this.observedUnindexedReflsCheckbox.disabled = true;
      this.calculatedReflsCheckbox.disabled = true;
      this.integratedReflsCheckbox.disabled = true;
      return;
    }
    this.observedUnindexedReflsCheckbox.disabled = !this.refl.hasXYZObsData();
    this.observedIndexedReflsCheckbox.disabled = !this.refl.hasMillerIndicesData();
    this.calculatedReflsCheckbox.disabled = !this.refl.hasXYZCalData();
    this.reciprocalCellCheckbox.disabled = !this.refl.hasMillerIndicesData();
    this.calculatedReflsCheckbox.disabled = !this.expt.hasCrystal(0);
    this.integratedReflsCheckbox.disabled = !this.refl.hasIntegratedData();
  }

  addBeam() {
    var beamLength = ReciprocalLatticeViewer.sizes()["beamLength"];
    var bd = this.expt.getBeamDirection(0); // Assume all experiments share the same beam

    // Incident beam to sample
    var incidentVertices = []
    incidentVertices.push(
      new THREE.Vector3(bd.x * -beamLength, bd.y * -beamLength, bd.z * -beamLength)
    );
    incidentVertices.push(
      new THREE.Vector3(bd.x * -beamLength * .5, bd.y * -beamLength * .5, bd.z * -beamLength * .5)
    );
    incidentVertices.push(new THREE.Vector3(0, 0, 0));
    const incidentLine = new THREE.BufferGeometry().setFromPoints(incidentVertices);
    const incidentMaterial = new THREE.LineBasicMaterial({
      color: this.colors["beam"],
      fog: true,
      depthWrite: false
    });
    const incidentMesh = new THREE.Line(incidentLine, incidentMaterial);
    this.beamMeshes.push(incidentMesh);
    window.scene.add(incidentMesh);

    // Outgoing beam from sample
    var outgoingVertices = []
    outgoingVertices.push(new THREE.Vector3(0, 0, 0));
    outgoingVertices.push(
      new THREE.Vector3(bd.x * beamLength * .5, bd.y * beamLength * .5, bd.z * beamLength * .5)
    );
    outgoingVertices.push(
      new THREE.Vector3(bd.x * beamLength, bd.y * beamLength, bd.z * beamLength)
    );
    const outgoingLine = new THREE.BufferGeometry().setFromPoints(outgoingVertices);
    const outgoingMaterial = new THREE.LineBasicMaterial({
      color: this.colors["beam"],
      transparent: true,
      opacity: .25,
      fog: true,
      depthWrite: false
    });
    const outgoingMesh = new THREE.Line(outgoingLine, outgoingMaterial);
    this.beamMeshes.push(outgoingMesh);
    window.scene.add(outgoingMesh);
  }

  addSample() {
    const sphereGeometry = new THREE.SphereGeometry(
      ReciprocalLatticeViewer.sizes()["sample"]
    );
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: this.colors["sample"],
      transparent: true,
      depthWrite: false
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.name = "sample";
    this.sampleMesh = sphere;
    window.scene.add(sphere);
  }

  clearCrystalRLV(){
    if (this.reciprocalCellMeshes.length === 0){
      return;
    }
    for (var i = 0; i < this.reciprocalCellMeshes.length; i++) {
      for (var j = 0; j < this.reciprocalCellMeshes[i].length; j++){
        window.scene.remove(this.reciprocalCellMeshes[i][j]);
        this.reciprocalCellMeshes[i][j].geometry.dispose();
        this.reciprocalCellMeshes[i][j].material.dispose();
      }
    }
    this.reciprocalCellMeshes = [];
  }

  updateCrystalRLV(){
    this.clearCrystalRLV();
    this.addCrystalRLV();
    this.updateReciprocalCell();
  }

  addCrystalRLV() {

    function getAvgRLVLength(crystalRLV) {
      const a = crystalRLV[0].length();
      const b = crystalRLV[1].length();
      const c = crystalRLV[2].length();
      return (a + b + c) / 3.;
    }

    if (!this.expt.hasCrystal(0)) {
      return;
    }

    const crystalRLVs = this.expt.getAllCrystalRLVs(); 
    const reciprocalCellMeshes = [];

    for (let i=0; i<crystalRLVs.length; i++){
      let crystalRLV = crystalRLVs[i];
      const avgRLVLength = getAvgRLVLength(crystalRLV);
      const minLineWidth = ReciprocalLatticeViewer.sizes()["minRLVLineWidth"];
      const maxLineWidth = ReciprocalLatticeViewer.sizes()["maxRLVLineWidth"];
      const lineWidthScaleFactor = ReciprocalLatticeViewer.sizes()["RLVLineWidthScaleFactor"];
      const lineWidth = Math.min(
        Math.max(avgRLVLength * lineWidthScaleFactor, minLineWidth), maxLineWidth
      );

      var material;
      if (this.crystalView){
        material = new MeshLineMaterial({
          lineWidth: lineWidth,
          color: this.colors["reflectionCrystalIndexed"][i % this.colors["reflectionCrystalIndexed"].length],
          depthWrite: false,
          sizeAttenuation: true
        });

      }
      else{
        material = new MeshLineMaterial({
          lineWidth: lineWidth,
          color: this.colors["reciprocalCell"],
          depthWrite: false,
          sizeAttenuation: true
        });
      }

      const a = crystalRLV[0].clone().multiplyScalar(this.rlpScaleFactor);
      const b = crystalRLV[1].clone().multiplyScalar(this.rlpScaleFactor);
      const c = crystalRLV[2].clone().multiplyScalar(this.rlpScaleFactor);

      const origin = new THREE.Vector3(0, 0, 0);

      const labelScaleFactor = Math.max(
        avgRLVLength * ReciprocalLatticeViewer.sizes()["RLVLabelScaleFactor"], 1
      );
      const labelColor = this.colors["RLVLabels"];
      const aSprite = this.getRLVLabel("a*", origin.clone().add(a).multiplyScalar(0.5), labelColor, labelScaleFactor);
      const bSprite = this.getRLVLabel("b*", origin.clone().add(b).multiplyScalar(0.5), labelColor, labelScaleFactor);
      const cSprite = this.getRLVLabel("c*", origin.clone().add(c).multiplyScalar(0.5), labelColor, labelScaleFactor);

      const cellVertices = [
        origin,
        a,
        a.clone().add(b),
        b,
        origin,
        c,
        c.clone().add(a),
        a,
        a.clone().add(b),
        a.clone().add(b).add(c),
        a.clone().add(c),
        c,
        b.clone().add(c),
        a.clone().add(b).add(c),
        b.clone().add(c),
        b,
        origin
      ];

      const line = new MeshLine();
      line.setPoints(cellVertices);
      const Mesh = new THREE.Mesh(line, material);
      reciprocalCellMeshes.push([Mesh, aSprite, bSprite, cSprite]);
      window.scene.add(Mesh);
      window.scene.add(aSprite);
      window.scene.add(bSprite);
      window.scene.add(cSprite);

    }
    this.reciprocalCellMeshes = reciprocalCellMeshes;
    this.requestRender();

  }

  getRLVLabel(text, pos, color, scaleFactor) {
    var canvas = document.createElement('canvas');

    canvas.width = 256;
    canvas.height = 128;
    var fontSize = ReciprocalLatticeViewer.sizes()["minRLVLabelSize"];
    fontSize *= scaleFactor;

    var context = canvas.getContext("2d");

    context.font = "Bold " + fontSize.toString() + "px Tahoma";
    context.fillStyle = color;
    context.textAlign = "center";
    context.textBaseline = "middle";

    context.fillText(text, canvas.width / 2, canvas.height / 2);

    var texture = new THREE.CanvasTexture(canvas);

    var material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.5,
      depthWrite: false,
      depthTest: false,
      sizeAttenuation: true
    });

    var sprite = new THREE.Sprite(material);
    sprite.scale.set(100 * scaleFactor, 50 * scaleFactor, 1);
    sprite.position.copy(pos);

    return sprite;
  }

  setCameraSmooth(position) {
    this.rotateToPos(position);
    this.resetCameraZoomSmooth();
  }

  setCameraToDefaultPosition() {
    this.setCameraSmooth(ReciprocalLatticeViewer.cameraPositions()["default"]);
  }

  setCameraToDefaultPositionWithExperiment() {
    this.setCameraSmooth(ReciprocalLatticeViewer.cameraPositions()["defaultWithExperiment"]);
  }

  setCameraToCentrePosition() {
    this.setCameraSmooth(ReciprocalLatticeViewer.cameraPositions()["centre"]);
  }

  displayHeaderText(text) {
    this.showHeaderText();
    this.headerText.innerHTML = text;
  }

  appendHeaderText(text) {
    this.headerText.innerHTML += text;
  }

  hideHeaderText() {
    this.headerText.style.display = "none";
  }

  showHeaderText() {
    this.headerText.style.display = "block";
  }

  displayDefaultHeaderText() {
    if (this.hasExperiment() || !this.isStandalone) {
      this.hideHeaderText();
    }
    else {
      this.displayHeaderText(ReciprocalLatticeViewer.text()["default"]);
    }
  }

  displayImageFilenames(exptID) {
    this.displayHeaderText(this.expt.experiments[exptID].imageFilename);
    this.displayingTextFromHTMLEvent = true;
  }

  displayNumberOfReflections() {
    this.displayHeaderText(this.refl.numReflections + " reflections");
    this.displayingTextFromHTMLEvent = true;
  }

  stopDisplayingText() {
    this.displayingTextFromHTMLEvent = false;
  }


  highlightObject(obj) {
    obj.material.color = new THREE.Color(this.colors["highlight"]);
  }

  beamHidden() {
    if (this.beamMeshes.length === 0) {
      return true;
    }
    return this.beamMeshes[0].material.opacity < 0.01;
  }

  sampleHidden() {
    if (this.sampleMesh === null) {
      return true;
    }
    return this.sampleMesh.material.opacity < 0.01;
  }

  disableMouseClick() {

    this.preventMouseClick = true;
  }

  enableMouseClick() {
    this.preventMouseClick = false;
  }


  updateGUIInfo() {

    function updateReflectionInfo(viewer) {

      function getDSpacing(arr, idx, viewer) {
        const rlp = new THREE.Vector3(
          arr[3 * idx] / viewer.rlpScaleFactor,
          arr[(3 * idx) + 1] / viewer.rlpScaleFactor,
          arr[(3 * idx) + 2] / viewer.rlpScaleFactor
        );
        return (1 / rlp.length()).toFixed(3);
      }

      if (viewer.observedIndexedReflsCheckbox.checked) {
        for (var i = 0; i < viewer.reflPointsObsIndexed.length; i++){
          const intersects = window.rayCaster.intersectObjects(viewer.reflPointsObsIndexed[i]);
          window.rayCaster.setFromCamera(window.mousePosition, window.camera);
          if (intersects.length > 0) {
            for (var j = 0; j < intersects.length; j++) {
              const summary = viewer.refl.getIndexedSummaryById(intersects[j].index);
              viewer.displayHeaderText(
                summary + " <b>res: </b>" + getDSpacing(
                  viewer.reflPositionsIndexed[i], intersects[j].index, viewer
                ) + " Angstrom"
              );
            }
          }
        }
      }
      if (viewer.observedUnindexedReflsCheckbox.checked) {
        for (var i = 0; i < viewer.reflPointsObsUnindexed.length; i++){
          const intersects = window.rayCaster.intersectObjects(viewer.reflPointsObsUnindexed[i]);
          window.rayCaster.setFromCamera(window.mousePosition, window.camera);
          if (intersects.length > 0) {
            for (var j = 0; j < intersects.length; j++) {
              const summary = viewer.refl.getUnindexedSummaryById(intersects[j].index);
              viewer.displayHeaderText(
                summary + " <b>res: </b>" + getDSpacing(
                  viewer.reflPositionsUnindexed[i], intersects[j].index, viewer
                ) + " Angstrom"
              );
            }
          }
        }
      }
    }

    function updateBeamInfo(viewer) {
      if (viewer.beamHidden()) {
        return;
      }
      const intersects = window.rayCaster.intersectObjects(viewer.beamMeshes);
      window.rayCaster.setFromCamera(window.mousePosition, window.camera);
      if (intersects.length > 0) {
        const text = "<b>beam: </b>" + viewer.expt.getBeamSummary(0);
        viewer.displayHeaderText(text);
      }
    }

    function updateCrystalInfo(viewer) {
      if (viewer.sampleHidden()) {
        return;
      }
      if (viewer.expt.getCrystalSummary() === null) {
        return;
      }
      const intersects = window.rayCaster.intersectObjects([viewer.sampleMesh]);
      window.rayCaster.setFromCamera(window.mousePosition, window.camera);
      if (intersects.length > 0) {
        const text = "<b>crystal: </b>" + viewer.expt.getCrystalSummary();
        viewer.displayHeaderText(text);
      }

    }

    if (this.displayingTextFromHTMLEvent) { return; }
    this.displayDefaultHeaderText();
    updateReflectionInfo(this);
    updateBeamInfo(this);
    updateCrystalInfo(this);
  }

  rotateToPos(pos) {
    gsap.to(window.camera.position, {
      duration: 1,
      x: -pos.x,
      y: -pos.y,
      z: -pos.z,
      onUpdate: function() {
        window.camera.lookAt(pos);
        window.viewer.requestRender();
      }
    });
  }

  resetCameraZoomSmooth() {
    gsap.to(window.camera, {
      duration: 1,
      zoom: 1,
      onUpdate: function() {
        window.camera.updateProjectionMatrix();
        window.viewer.requestRender();
      }
    });
    window.controls.update();

  }

  zoomInOnObject(obj, screenWidthFraction = 0.2) {

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    const box = new THREE.Box3();

    box.makeEmpty();
    box.expandByObject(obj);

    box.getSize(size);
    box.getCenter(center);

    const vertices = [
      new THREE.Vector3(center.x - size.x / 2, center.y - size.y / 2, center.z - size.z / 2),
      new THREE.Vector3(center.x - size.x / 2, center.y - size.y / 2, center.z + size.z / 2),
      new THREE.Vector3(center.x - size.x / 2, center.y + size.y / 2, center.z - size.z / 2),
      new THREE.Vector3(center.x - size.x / 2, center.y + size.y / 2, center.z + size.z / 2),
      new THREE.Vector3(center.x + size.x / 2, center.y - size.y / 2, center.z - size.z / 2),
      new THREE.Vector3(center.x + size.x / 2, center.y - size.y / 2, center.z + size.z / 2),
      new THREE.Vector3(center.x + size.x / 2, center.y + size.y / 2, center.z - size.z / 2),
      new THREE.Vector3(center.x + size.x / 2, center.y + size.y / 2, center.z + size.z / 2),
    ];

    const screenVertices = vertices.map(vertex => {
      const projectedVertex = vertex.clone().project(camera);
      projectedVertex.x = (projectedVertex.x + 1) / 2 * window.innerWidth;
      projectedVertex.y = (1 - projectedVertex.y) / 2 * window.innerHeight;
      return projectedVertex;
    });

    let largestDimension = 0;
    for (let i = 0; i < screenVertices.length; i++) {
      for (let j = i + 1; j < screenVertices.length; j++) {
        const distance = screenVertices[i].distanceTo(screenVertices[j]);
        if (distance > largestDimension) {
          largestDimension = distance;
        }
      }
    }

    const zoomTarget = window.camera.zoom * (window.innerWidth * screenWidthFraction) / largestDimension;


    gsap.to(window.camera, {
      duration: 1,
      zoom: zoomTarget,
      onUpdate: function() {
        window.camera.updateProjectionMatrix();
        window.viewer.requestRender();
      }
    });
    window.controls.update();

  }

	toggleExperimentList(){
		document.getElementById("experimentDropdown").classList.toggle("show");
    var dropdownIcon = document.getElementById("dropdownIcon");
    dropdownIcon.classList.toggle("fa-chevron-down");
    dropdownIcon.classList.toggle("fa-chevron-right"); 
	}

  toggleCrystalVisibility(crystalIDLabel){
    var crystalID = parseInt(crystalIDLabel.split("-").pop());
    this.visibleCrystalIDs[crystalID] = !this.visibleCrystalIDs[crystalID];
    this.updateCrystalCalculatedReflections();
    this.updateCrystalIndexedReflections();
    this.updateCrystalIntegratedReflections();
    this.updateCrystalRLV();
    var dropdownIcon = document.getElementById("crystalID-dropdown-icon-"+crystalID.toString());
    dropdownIcon.classList.toggle("fa-check");
  }

  toggleAllCrystalVisibility(){
    var dropdownIcon = document.getElementById("crystalID-dropdown-icon-all");
    dropdownIcon.classList.toggle("fa-check");
    var visible = dropdownIcon.classList.contains("fa-check");
    var crystalIDs = Object.keys(this.visibleCrystalIDs);
    for (var crystalID of crystalIDs){
      this.visibleCrystalIDs[crystalID] = visible;
      var dropdownIcon = document.getElementById("crystalID-dropdown-icon-"+crystalID.toString());
      if (dropdownIcon.classList.contains("fa-check") !== visible){
        dropdownIcon.classList.toggle("fa-check");
      }
    }
    this.updateCrystalIndexedReflections();
    this.updateCrystalCalculatedReflections();
    this.updateCrystalIntegratedReflections();
  }

  toggleExptVisibility(exptIDLabel){
    var exptID = parseInt(exptIDLabel.split("-").pop());
    this.visibleExpts[exptID] = !this.visibleExpts[exptID];
    this.updateObservedIndexedReflections();
    this.updateObservedUnindexedReflections();
    this.updateCalculatedReflections();
    this.updateIntegratedReflections();
    var dropdownIcon = document.getElementById("exptID-dropdown-icon-"+exptID.toString());
    dropdownIcon.classList.toggle("fa-check");
  }

  toggleAllExptVisibility(){
    var dropdownIcon = document.getElementById("exptID-dropdown-icon-all");
    dropdownIcon.classList.toggle("fa-check");
    var visible = dropdownIcon.classList.contains("fa-check");
    for (var exptID = 0; exptID < this.visibleExpts.length; exptID++){
      this.visibleExpts[exptID] = visible;
      var dropdownIcon = document.getElementById("exptID-dropdown-icon-"+exptID.toString());
      if (dropdownIcon.classList.contains("fa-check") !== visible){
        dropdownIcon.classList.toggle("fa-check");
      }
    }
    this.updateObservedIndexedReflections();
    this.updateObservedUnindexedReflections();
    this.updateCalculatedReflections();
    this.updateIntegratedReflections();
  }



  clearExperimentList(){
    var dropdownContent = document.getElementById("experimentDropdown");
    dropdownContent.innerHTML = ""; 
  }

  getCrystalIDs(){
    if (this.crystalPointsIndexed){
      return Object.keys(this.crystalPointsIndexed);
    }
    return ["-1"]
  }

  getCrystalLabels(){
    var crystalLabels = this.getCrystalIDs();
    crystalLabels = crystalLabels.map(id => id === "-1" ? "unindexed" : id);
    return crystalLabels;
  }

  updateCrystalDropdown(){
    var maxLabelSize = 22;
    var minNumForAllButton = 4;
    var crystalIDs = this.getCrystalIDs();
    var crystalLabels = this.getCrystalLabels();
    var addAllButton = crystalLabels.length > minNumForAllButton;
    var firstLabel = null;
    const visibleCrystalIDs = {};
    var dropdownContent = document.getElementById("experimentDropdown");
    dropdownContent.innerHTML = ""; 

    for (var i = 0; i < crystalIDs.length; i++) {
        var label = document.createElement("label");
        label.classList.add("experiment-label"); 
        const crystalID = crystalIDs[i];
        var color = null;
        if (crystalID === "-1"){
          continue
        }
        color = this.colors["reflectionCrystalIndexed"][parseInt(crystalID) % this.colors["reflectionCrystalIndexed"].length];
        var hexColor = '#' + color.toString(16).padStart(6, '0');
        label.style.color = hexColor;
        
        var icon = document.createElement("i");
        icon.classList.add("fa", "fa-check"); 
        icon.style.float = "right"; 
        icon.id = "crystalID-dropdown-icon-"+crystalID;
        
        var crystalLabel = crystalLabels[i];
        if (crystalLabel.length > maxLabelSize){
          crystalLabel = crystalLabel.slice(0,19) + "...";
        }
        label.textContent = crystalLabel;
        label.id = "crystalID-"+crystalIDs[i];
        
        label.appendChild(icon);
        
        label.addEventListener('click', (event) => {
            this.toggleCrystalVisibility(event.target.id);
        });

        if (addAllButton && firstLabel === null){
          firstLabel = label;
        }

        dropdownContent.appendChild(label);
        dropdownContent.appendChild(document.createElement("br"));
        visibleCrystalIDs[crystalID] = true;
    }
    if (addAllButton){
      console.assert(firstLabel !== null);
      var label = document.createElement("label");
      label.classList.add("experiment-label"); 
      
      var icon = document.createElement("i");
      icon.classList.add("fa", "fa-check"); 
      icon.style.float = "right"; 
      icon.id = "crystalID-dropdown-icon-all";
      
      var crystalLabel = "All";
      label.textContent = crystalLabel;
      label.id = "crystalID-all";
      
      label.appendChild(icon);
      
      label.addEventListener('click', (event) => {
          this.toggleAllCrystalVisibility();
      });

      dropdownContent.insertBefore(label, firstLabel);
      dropdownContent.insertBefore(label, firstLabel);

    }
    this.visibleCrystalIDs = visibleCrystalIDs;



  }

  updateExperimentList() {
    var maxLabelSize = 22;
    var minNumForAllButton = 4;

    var exptIDs = this.expt.getExptIDs();
    var exptLabels = this.expt.getExptLabels();
    var addAllButton = exptLabels.length > minNumForAllButton;
    var firstLabel = null;
    const visibleExpts = [];
    var dropdownContent = document.getElementById("experimentDropdown");
    dropdownContent.innerHTML = ""; 

    for (var i = 0; i < exptIDs.length; i++) {
        var label = document.createElement("label");
        label.classList.add("experiment-label"); 
        const color = this.colors["reflectionObsUnindexed"][exptIDs[i] % this.colors["reflectionObsUnindexed"].length];
        var hexColor = '#' + color.toString(16).padStart(6, '0');
        label.style.color = hexColor;
        
        var icon = document.createElement("i");
        icon.classList.add("fa", "fa-check"); 
        icon.style.float = "right"; 
        icon.id = "exptID-dropdown-icon-"+exptIDs[i];
        
        var exptLabel = exptLabels[i];
        if (exptLabel.length > maxLabelSize){
          exptLabel = exptLabel.slice(0,19) + "...";
        }
        label.textContent = exptLabel;
        label.id = "exptID-"+exptIDs[i];
        
        label.appendChild(icon);
        
        label.addEventListener('click', (event) => {
            this.toggleExptVisibility(event.target.id);
        });

        if (addAllButton && firstLabel === null){
          firstLabel = label;
        }

        dropdownContent.appendChild(label);
        dropdownContent.appendChild(document.createElement("br"));
        visibleExpts.push(true);
    }
    if (addAllButton){
      console.assert(firstLabel !== null);
      var label = document.createElement("label");
      label.classList.add("experiment-label"); 
      
      var icon = document.createElement("i");
      icon.classList.add("fa", "fa-check"); 
      icon.style.float = "right"; 
      icon.id = "exptID-dropdown-icon-all";
      
      var exptLabel = "All";
      label.textContent = exptLabel;
      label.id = "exptID-all";
      
      label.appendChild(icon);
      
      label.addEventListener('click', (event) => {
          this.toggleAllExptVisibility();
      });

      dropdownContent.insertBefore(label, firstLabel);
      dropdownContent.insertBefore(label, firstLabel);

    }
    this.visibleExpts = visibleExpts;
  }

  animate() {
    if (!this.renderRequested) {
      return;
    }
    window.viewer.updateGUIInfo();
    window.controls.update();
    window.renderer.render(window.scene, window.camera);
    this.renderRequested = false;
    window.viewer.enableMouseClick();
  }

  requestRender() {
    if (typeof window !== "undefined" && !this.renderRequested) {
      this.renderRequested = true;
      window.requestAnimationFrame(this.animate.bind(this));
    }
  }
}

export function setupScene() {

  /**
   * Sets the renderer, camera, controls, event listeners
   */


  if (typeof window.viewer === "undefined") { return; }

  // Renderer
  window.renderer = new THREE.WebGLRenderer();
  window.renderer.setClearColor(window.viewer.colors["background"]);
  window.renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(window.renderer.domElement);

  window.scene = new THREE.Scene()
  window.scene.fog = new THREE.Fog(window.viewer.colors["background"], 500, 8000);

  var frustumSize = 500;
  var aspect = window.innerWidth / window.innerHeight;
  window.camera = new THREE.OrthographicCamera(
    frustumSize * aspect / -2,
    frustumSize * aspect / 2,
    frustumSize / 2,
    frustumSize / -2,
    1,
    50000
  );

  window.renderer.render(window.scene, window.camera);
  window.rayCaster = new THREE.Raycaster(); // used for all raycasting

  // Controls
  window.controls = new OrbitControls(window.camera, window.renderer.domElement);
  window.controls.maxDistance = 3000;
  window.controls.enablePan = false;
  window.controls.rotateSpeed = 0.2;
  window.controls.update();
  window.controls.addEventListener("change", function() { window.viewer.requestRender(); });

  // Events
  window.mousePosition = new THREE.Vector2();
  window.addEventListener("mousemove", function(e) {
    window.mousePosition.x = (e.clientX / window.innerWidth) * 2 - 1;
    window.mousePosition.y = - (e.clientY / window.innerHeight) * 2 + 1;
    window.viewer.requestRender();
  });

  window.addEventListener("resize", function() {
    window.camera.aspect = window.innerWidth / window.innerHeight;
    window.camera.updateProjectionMatrix();
    window.renderer.setSize(window.innerWidth, window.innerHeight);
    window.viewer.requestRender();
  });

  window.addEventListener("dragstart", (event) => {
    dragged = event.target;
  });

  window.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  window.addEventListener('drop', function(event) {

    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files[0];
    const fileExt = file.name.split(".").pop();
    if (fileExt == "refl" && window.viewer.isStandalone) {
      window.viewer.addReflectionTable(file);
    }
    else if (fileExt == "expt" && window.viewer.isStandalone) {
      window.viewer.addExperiment(file);
    }
  });

  window.addEventListener('dblclick', function(event) {
  });

  window.addEventListener('mousedown', function(event) {
    if (event.button == 2) {
      window.viewer.setCameraToDefaultPositionWithExperiment();
    }
  });
  window.addEventListener('keydown', function(event) {
    if (event.key === "s") {
      window.viewer.toggleSidebar();
    }
  });
  window.viewer.updateReciprocalCell(false);
  window.viewer.setCameraToDefaultPosition();
  window.viewer.requestRender();
}
