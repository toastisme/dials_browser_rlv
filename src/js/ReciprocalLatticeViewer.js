import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { gsap } from "gsap";
import { MeshLine, MeshLineMaterial } from 'three.meshline';
import { ExptParser } from "dials_javascript_parser/ExptParser.js";
import { marchingCubes } from 'marching-cubes-fast';

class MeshCollection{

  /*
  * Sets of meshes that are related
  * E.g. 
  *   all indexed reflections at different orientations
  *   all indexed reflections for different crystals
  *   all reciprocal cells in the crystal view
  */

  constructor(collection){
    // collection assumed to be a dictionary
    // {id : value}
    this.collection = collection;
  }

  [Symbol.iterator]() {
    const entries = Object.entries(this.collection);
    let index = 0;

    return {
      next: () => {
        if (index < entries.length) {
          const value = entries[index];
          index++;
          return { value, done: false };
        } else {
          return { done: true };
        }
      }
    };
  }

  keys(){
    return Object.keys(this.collection);
  }

  empty(){
    return (Object.keys(this.collection).length === 0);
  }

  hide(key=null){
    if (key && key in this.collection){
      this.collection[key].hide();
    }
    else{
      let keys = Object.keys(this.collection);
      for (let key of keys){
        this.collection[key].hide();
      }
    }
  }

  show(key=null){
    if (key && key in this.collection){
      this.collection[key].show();
    }
    else{
      let keys = Object.keys(this.collection);
      for (let key of keys){
        this.collection[key].show();
      }
    }
  }

  showVisibleIDs(visibleIDs){
    let keys = Object.keys(visibleIDs);
    for (let key of keys){
      if (key in this.collection){
        if (visibleIDs[key]){
          this.collection[key].show();
        }
        else{
          this.collection[key].hide();
        }
      }
    }
  }
  
  destroy(key=null){
    if (key && key in this.collection){
      this.collection[key].destroy();
    }
    else{
      let keys = Object.keys(this.collection);
      for (let key of keys){
        this.collection[key].destroy();
      }
    }
    this.collection = {};
  }

  resize(newSize, key=null){
    if (key && key in this.collection){
      this.collection[key].resize(newSize);
    }
    else{
      let keys = Object.keys(this.collection);
      for (let key of keys){
        this.collection[key].resize(newSize);
      }
    }
  }
}


class ReflectionSet{

  /*
   * Reflections that share the same color and behaviour
   * E.g. all reflections of the same type (indexed/unindexed etc.)
   * that belong to the same orientation 
  */

  constructor(positions, color, size, sprite, visible, rLPScaleFactor){
    this.positions = positions;
    this.color = color;
    this.sprite = sprite;
    this.rLPScaleFactor = rLPScaleFactor;
    const points = this.createPoints(positions, color, size, sprite);
    window.scene.add(points);
    this.points = points;
    if (!visible){
      this.hide();
    }
  }

  createPoints(positions, color, size, sprite){
    const reflGeometry = new THREE.BufferGeometry();
    reflGeometry.setAttribute(
      "position", new THREE.Float32BufferAttribute(positions, 3)
    );

    const reflMaterial = new THREE.PointsMaterial({
      size: size,
      map: sprite,
      alphaTest: 0.5,
      transparent: true,
      color: color
    });
    return new THREE.Points(reflGeometry, reflMaterial);
  }

  hide(){
    this.points.visible = false;
  }

  show(){
    this.points.visible = true;
  }

  isVisible(){
    return this.points.visible;
  }

  destroy(){
    window.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }

  resize(newSize){
    const visible = this.points.visible;
    this.destroy();
    const points = this.createPoints(this.positions, this.color, newSize, this.sprite);
    window.scene.add(points);
    this.points = points;
    this.size = newSize;
    if (!visible){
      this.hide();
    }
  }
}

class ReciprocalCell{
  constructor(vectors, color, lineWidth, fontSize){
    this.vectors = vectors;
    this.color = color;
    this.lineWidth = lineWidth;
    this.fontSize = fontSize;
    this.meshes = this.createMeshes(
      vectors, color, lineWidth, fontSize);
  }

  createMeshes(vectors, color, lineWidth, fontSize){

      const a = vectors[0].clone();
      const b = vectors[1].clone();
      const c = vectors[2].clone();

      const origin = new THREE.Vector3(0, 0, 0);

      const cssColor = `#${color.toString(16).padStart(6, '0')}`
      const aSprite = this.getRLVLabel(
        "a*", origin.clone().add(a).multiplyScalar(0.5), cssColor, 
        fontSize);
      const bSprite = this.getRLVLabel(
        "b*", origin.clone().add(b).multiplyScalar(0.5), cssColor, 
        fontSize);
      const cSprite = this.getRLVLabel(
        "c*", origin.clone().add(c).multiplyScalar(0.5), cssColor, 
        fontSize);

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
      const material = new MeshLineMaterial({
        lineWidth: lineWidth,
        color: color,
        depthWrite: false,
        sizeAttenuation: true
      });
      const Mesh = new THREE.Mesh(line, material);
      window.scene.add(Mesh);
      window.scene.add(aSprite);
      window.scene.add(bSprite);
      window.scene.add(cSprite);
      window.viewer.requestRender();
      return [Mesh, aSprite, bSprite, cSprite];
  }

  getRLVLabel(text, pos, color, fontSize) {
    var canvas = document.createElement('canvas');

    canvas.width = 256;
    canvas.height = 128;

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
    sprite.scale.set(100, 50, 1);
    sprite.position.copy(pos);

    return sprite;
  }

  destroy(){
    for (let i = 0; i < this.meshes.length; i++){
      window.scene.remove(this.meshes[i]);
      this.meshes[i].geometry.dispose();
      this.meshes[i].material.dispose();
    }
    this.meshes = [];
  }

  hide(){
    for (let i = 0; i < this.meshes.length; i++){
      this.meshes[i].visible = false;
    }
  }

  show(){
    for (let i = 0; i < this.meshes.length; i++){
      this.meshes[i].visible = true;
    }
  }

  resize(newSize){
    return;
  }
}

export class ReciprocalLatticeViewer {
  constructor(exptParser, reflParser, calculatedIntegratedReflParser, standalone, colors = null) {

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
    this.calculatedIntegratedRefl = calculatedIntegratedReflParser;

    // Html elements
    this.headerText = window.document.getElementById("headerText");
    this.sidebar = window.document.getElementById("sidebar");
    this.closeExptButton = document.getElementById("closeExpt");
    this.closeReflButton = document.getElementById("closeRefl");
    this.indexedReflectionsCheckbox = document.getElementById("indexedReflectionsCheckbox");
    this.unindexedReflectionsCheckbox = document.getElementById("unindexedReflectionsCheckbox");
    this.calculatedReflectionsCheckbox = document.getElementById("calculatedReflectionsCheckbox");
    this.integratedReflectionsCheckbox = document.getElementById("integratedReflectionsCheckbox");
    this.reciprocalCellCheckbox = document.getElementById("reciprocalCellCheckbox");
    this.crystalFrameCheckbox = document.getElementById("crystalFrameCheckbox");
    this.reflectionSize = document.getElementById("reflectionSizeSlider");

    // rs_mapper
    this.currentMesh = null;
    this.meshData = null;
    this.meshShape = null;
    this.rLPMin = null;
    this.rLPMax = null;
    this.rLPStep = null;
    this.beamMeshes = [];
    this.sampleMesh = null;
    this.reciprocalMeshVisible = false;

    // Reflections
    this.unindexedReflections = new MeshCollection({});
    this.indexedReflections = new MeshCollection({});
    this.calculatedReflections = new MeshCollection({});
    this.integratedReflections = new MeshCollection({});
    this.crystalIndexedReflections = new MeshCollection({});
    this.crystalCalculatedReflections = new MeshCollection({});
    this.crystalIntegratedReflections = new MeshCollection({});

    // Reciprocal cells
    this.orientationReciprocalCells = new MeshCollection({});
    this.crystalReciprocalCells = new MeshCollection({});

    // Bookkeeping what is visible
    this.visibleExptIDs = {};
    this.visibleCrystalIDs = {};

    // Bookkeeping for meshes
    this.beamMeshes = [];
    this.sampleMesh = null;
    this.crystalView = false;
    this.crystalFrame = false;
    this.integratedReflectionsFromCalculated = false;

    this.preventMouseClick = false;

    this.savedUserState = null;

    this.rLPScaleFactor = 1000;
    this.reflSprite = new THREE.TextureLoader().load("resources/disc.png");

    this.displayingTextFromHTMLEvent = false;

    this.updateReflectionCheckboxStatus();
    this.setDefaultReflectionsDisplay();

  }

  static defaultColors() {
    return {
      "background": 0x222222,
      "sample": 0xfdf6e3,
      "reflectionUnindexed": [
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
      "reflectionIndexed": 0xe74c3c,
			"reflectionCrystalUnindexed": 0x6a7688,
			"reciprocalMesh": 0x6a7688,
      "reflectionCalculated": 0xffaaaa,
			"reflectionIntegrated" : 0xffc25c,
      "highlight": 0xFFFFFF,
      "beam": 0xFFFFFF,
      "reciprocalCell": 0xFFFFFF,
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
      "RLVLabelScaleFactor": 30,
      "meshScaleFactor" : 1000.,
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

  saveUserState(){
    this.savedUserState = {
      "unindexedReflectionsCheckbox" : this.unindexedReflectionsCheckbox.checked,
      "indexedReflectionsCheckbox" : this.indexedReflectionsCheckbox.checked,
      "calculatedReflectionsCheckbox" : this.calculatedReflectionsCheckbox.checked,
      "integratedReflectionsCheckbox" : this.integratedReflectionsCheckbox.checked,
      "crystalFrameCheckbox" : this.crystalFrameCheckbox.checked,
      "reciprocalCellCheckbox" : this.reciprocalCellCheckbox.checked,
      "visibleExptIDs" : this.visibleExptIDs,
      "visibleCrystalIDs" : this.visibleCrystalIDs
    };
  }

  applySavedUserState(){
    if (this.savedUserState === null){return;}
    const s = this.savedUserState;
    this.unindexedReflectionsCheckbox.checked = s["unindexedReflectionsCheckbox"];
    this.indexedReflectionsCheckbox.checked = s["indexedReflectionsCheckbox"];
    this.calculatedReflectionsCheckbox.checked = s["calculatedReflectionsCheckbox"];
    this.integratedReflectionsCheckbox.checked = s["integratedReflectionsCheckbox"];
    this.crystalFrameCheckbox.checked = s["crystalFrameCheckbox"];
    this.reciprocalCellCheckbox.checked = s["reciprocalCellCheckbox"];
    this.visibleExptIDs = s["visibleExptIDs"];
    this.visibleCrystalIDs = s["visibleCrystalIDs"];
    this.updateReciprocalCellsVisibility();
    this.updateExptIDVisibility();
    this.updateCrystalIDVisibility();
    this.updateReflectionsVisibility();
  }

  clearSavedUserState(){
    this.savedUserState = null;
  }

  toggleSidebar() {
    this.sidebar.style.display = this.sidebar.style.display === 'block' ? 'none' : 'block';
  }

  showSidebar() {
    this.sidebar.style.display = 'block';
  }

  updateCrystalFrame(){
    this.saveUserState();
    if (!this.expt.hasCrystal(0)){
      return;
    }
    this.crystalFrame = this.crystalFrameCheckbox.checked;
    this.addReciprocalCells();

    if (!this.refl.hasReflTable()){
      return;
    }
    this.addReflectionsFromJSONMsgpack(this.refl.rawReflData, this.integratedReflectionsFromCalculated);
    if (this.integratedReflectionsFromCalculated){
      this.addCalculatedIntegratedReflectionsFromJSONMsgpack(this.calculatedIntegratedRefl.rawReflData);
    }
    this.applySavedUserState();
    this.clearSavedUserState();
  }

  updateReflectionsVisibility(){
    /**
     * Uses checkbox and visible id info to check 
     * which reflections should be visible
     */
    this.updateUnindexedReflectionsVisibility();
    this.updateIndexedReflectionsVisibility();
    this.updateCalculatedReflectionsVisibility();
    this.updateIntegratedReflectionsVisibility();
  }


  updateIndexedReflectionsVisibility() {
    if (this.indexedReflectionsCheckbox.checked){
      if (this.crystalView){
        this.crystalIndexedReflections.showVisibleIDs(this.visibleCrystalIDs);
        this.indexedReflections.hide();
      }
      else{
        this.indexedReflections.showVisibleIDs(this.visibleExptIDs);
        this.crystalIndexedReflections.hide();
      }
    }
    else{
      this.crystalIndexedReflections.hide();
      this.indexedReflections.hide();
      if (this.unindexedReflectionsCheckbox.checked && this.crystalView){
        this.crystalIndexedReflections.show("-1");
      }
    }
    this.requestRender();
  }

  updateUnindexedReflectionsVisibility() {
    if (this.unindexedReflectionsCheckbox.checked){
      if (this.crystalView){
        this.crystalIndexedReflections.show("-1");
        this.unindexedReflections.hide();
      }
      else{
        this.unindexedReflections.showVisibleIDs(this.visibleExptIDs);
        this.crystalIndexedReflections.hide("-1");
      }
    }
    else{
      this.unindexedReflections.hide();
      this.crystalIndexedReflections.hide("-1");
    }
    this.requestRender();
  }

  updateCalculatedReflectionsVisibility() {
    if (this.calculatedReflectionsCheckbox.checked){
      if (this.crystalView){
        this.crystalCalculatedReflections.showVisibleIDs(this.visibleCrystalIDs);
        this.calculatedReflections.hide();
      }
      else{
        this.calculatedReflections.showVisibleIDs(this.visibleExptIDs);
        this.crystalCalculatedReflections.hide();
      }
    }
    else{
      this.calculatedReflections.hide();
      this.crystalCalculatedReflections.hide();
    }
    this.requestRender();
  }

  updateIntegratedReflectionsVisibility() {
    if (this.integratedReflectionsCheckbox.checked){
      if (this.crystalView){
        this.crystalIntegratedReflections.showVisibleIDs(this.visibleCrystalIDs);
        this.integratedReflections.hide();
      }
      else{
        this.integratedReflections.showVisibleIDs(this.visibleExptIDs);
        this.crystalIntegratedReflections.hide();
      }
    }
    else{
      this.integratedReflections.hide();
      this.crystalIntegratedReflections.hide();
    }
    this.requestRender();
  }

  updateReciprocalCellsVisibility(){
    if (!this.reciprocalCellCheckbox.checked){
      this.orientationReciprocalCells.hide();
      this.crystalReciprocalCells.hide();
      this.requestRender();
      return;
    }

    if (this.crystalView){
      this.crystalReciprocalCells.showVisibleIDs(this.visibleCrystalIDs);
      this.orientationReciprocalCells.hide();
    }
    else{
      this.orientationReciprocalCells.show();
      this.crystalReciprocalCells.hide();
    }
    this.requestRender();
  }


  switchToCrystalView(){
    this.crystalView = true;
    const dropdownButton = document.getElementById('selectionDropdownButton');
    dropdownButton.innerHTML = `<b>${"Crystals"}</b> <i class="fa fa-chevron-right" id="dropdownIcon"></i>`;
    this.setSelectionDropdownToCrystals();
    this.updateReflectionsVisibility();
    this.updateReciprocalCellsVisibility();
  }

  switchToOrientationView(){
    this.crystalView = false;
    const dropdownButton = document.getElementById('selectionDropdownButton');
    dropdownButton.innerHTML = `<b>${"Orientations"}</b> <i class="fa fa-chevron-right" id="dropdownIcon"></i>`;
    this.setSelectionDropdownToOrientations();
    this.updateReflectionsVisibility();
    this.updateReciprocalCellsVisibility();
  }

  updateReflectionSize() {
    if (!this.hasReflectionTable()) {
      return;
    }
    const newSize = this.reflectionSize.value;
    this.unindexedReflections.resize(newSize);
    this.indexedReflections.resize(newSize);
    this.calculatedReflections.resize(newSize);
    this.integratedReflections.resize(newSize);
    this.crystalIndexedReflections.resize(newSize);
    this.crystalCalculatedReflections.resize(newSize);
    this.crystalIntegratedReflections.resize(newSize);

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
    if (this.sampleMesh) {
      window.scene.remove(this.sampleMesh);
      this.sampleMesh.geometry.dispose();
      this.sampleMesh.material.dispose();
      this.sampleMesh = null;
    }

    this.expt.clearExperiment();
    this.hideCloseExptButton();

    this.clearReflectionTable();
    this.clearReciprocalCells();
    this.clearSelectionDropdown();
    this.requestRender();
  }

  addExperiment = async (file) => {
    this.clearExperiment();
    this.clearReflectionTable();
    await this.expt.parseExperiment(file);
    console.assert(this.hasExperiment());
    this.addBeam();
    this.addSample();
    this.addReciprocalCells();
    this.setCameraToDefaultPositionWithExperiment();
    this.showSidebar();
    if (this.isStandalone) {
      this.showCloseExptButton();
    }
    this.setSelectionDropdownToOrientations();
    this.requestRender();

  }

  addExperimentFromJSONString = async (
    jsonString,
    defaultSetup = false) => {

    if (!defaultSetup){
      this.saveUserState();
    }
    this.clearExperiment();
    await this.expt.parseExperimentJSON(jsonString);
    console.assert(this.hasExperiment());
    this.addBeam();
    this.addSample();
    this.addReciprocalCells();
    if (defaultSetup) {
      this.setCameraToDefaultPositionWithExperiment();
      this.showSidebar();
    }
    if (this.isStandalone) {
      this.showCloseExptButton();
    }
    if (this.crystalView){
      this.setSelectionDropdownToCrystals();
    }
    else{
      this.setSelectionDropdownToOrientations();
    }
    if (!defaultSetup){
      this.applySavedUserState();
      this.clearSavedUserState();
    }
    
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

  clearReflectionTable() {
    this.unindexedReflections.destroy();
    this.indexedReflections.destroy();
    this.calculatedReflections.destroy();
    this.integratedReflections.destroy();
    this.crystalIndexedReflections.destroy();
    this.crystalCalculatedReflections.destroy();
    this.crystalIntegratedReflections.destroy();
    this.refl.clearReflectionTable();

    this.updateReflectionCheckboxStatus();
    this.setDefaultReflectionsDisplay();
    if (this.isStandalone){
      this.hideCloseReflButton();
    }
    this.requestRender();
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

  addReflectionsFromData(reflData, ignoreIntegratedReflections=false) {

    function getRLP(s1, wavelength, unitS0, viewer, goniometer, angle, U, addAnglesToReflections) {

      const rlp = s1.clone().normalize().sub(unitS0.clone().normalize()).multiplyScalar(1 / wavelength);

      if (!addAnglesToReflections) {
        return rlp.multiplyScalar(viewer.rLPScaleFactor);
      }
      if (angle == null) {
        console.warn("Rotation angles not in reflection table. Cannot generate rlps correctly if rotation experiment.");
        return rlp.multiplyScalar(viewer.rLPScaleFactor);
      }
      var fixedRotation = goniometer["fixedRotation"];
      const settingRotation = goniometer["settingRotation"];
      const rotationAxis = goniometer["rotationAxis"];

      if (window.viewer.crystalFrame && U !== null){
        fixedRotation = fixedRotation.clone().multiply(U);
      }
      rlp.applyMatrix3(settingRotation.clone().invert());
      rlp.applyAxisAngle(rotationAxis, -angle);
      rlp.applyMatrix3(fixedRotation.clone().invert().transpose());
      return rlp.multiplyScalar(viewer.rLPScaleFactor);
    }

    this.clearReflectionTable();
    if (!ignoreIntegratedReflections){
      this.refl.calculatedIntegratedPanelReflData = {};
      this.integratedReflectionsFromCalculated = false;
    }
    if (!this.hasExperiment()) {
      console.warn("Tried to add reflections but no experiment has been loaded");
      return;
    }

    this.refl.panelReflData = reflData;
    this.refl.reflTable = "reflData";

    const panelKeys = Object.keys(reflData);

    const positionsUnindexed = {};
    const positionsIndexed = {};
    const positionsCalculated = {};
    const positionsIntegrated = {};
    const crystalPositionsIndexed = {};
    const crystalPositionsCalculated = {};
    const crystalPositionsIntegrated = {};

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

      for (var j = 0; j < panelReflections.length; j++) {

        const panelReflection = panelReflections[j];
        const exptID = panelReflection["exptID"];
        var wavelength = this.expt.getBeamData(exptID)["wavelength"];
        var wavelengthCal = this.expt.getBeamData(exptID)["wavelength"];
        var unitS0 = this.expt.getBeamDirection(exptID).multiplyScalar(-1).normalize();
        var goniometer = this.expt.experiments[exptID].goniometer;

        if ("xyzObs" in panelReflection) {
          // Reflection contains observed position data
          const xyzObs = panelReflection["xyzObs"];

          if ("wavelength" in panelReflection) {
            wavelength = panelReflection["wavelength"];
          }
          if (!wavelength) {
            // Wavelength not found in reflection data or beam data
            continue;
          }

          const s1 = this.getS1(xyzObs, dMatrix, wavelength, pxSize);
          const angle = panelReflection["angleObs"];
          var U = null;
          if ("crystalID" in panelReflection && panelReflection["crystalID"] !== "-1"){
            U = this.expt.getCrystalU(parseInt(panelReflection["crystalID"]))
          }
          const rlp = getRLP(s1, wavelength, unitS0, this, goniometer, angle, U, addAnglesToReflections);

          if ("millerIdx" in panelReflection && panelReflection["indexed"]) {
            // Indexed reflection
            if (!positionsIndexed[exptID]){
              positionsIndexed[exptID] = [];
            }
            positionsIndexed[exptID].push(rlp.x);
            positionsIndexed[exptID].push(rlp.y);
            positionsIndexed[exptID].push(rlp.z);
          }
          else { 
            // Unindexed reflection
            if (!positionsUnindexed[exptID]){
              positionsUnindexed[exptID] = [];
            }
            positionsUnindexed[exptID].push(rlp.x);
            positionsUnindexed[exptID].push(rlp.y);
            positionsUnindexed[exptID].push(rlp.z);
          }

          if ("crystalID" in panelReflection){
            // Reflection has been assigned to a crystal
            const crystalID = panelReflection["crystalID"];
            if (!(crystalID in crystalPositionsIndexed)){
              crystalPositionsIndexed[crystalID] = [];
            }
            crystalPositionsIndexed[crystalID].push(rlp.x);
            crystalPositionsIndexed[crystalID].push(rlp.y);
            crystalPositionsIndexed[crystalID].push(rlp.z);
          }
        }

        if ("xyzCal" in panelReflection) {
          // Reflection contains calculated position data
          const xyzCal = panelReflection["xyzCal"];
          if ("wavelengthCal" in panelReflection) {
            wavelengthCal = panelReflection["wavelengthCal"];
          }
          if (!wavelengthCal) {
            continue;
          }
          const s1 = this.getS1(xyzCal, dMatrix, wavelengthCal, pxSize);
          const angle = panelReflection["angleCal"];
          const rlp = getRLP(s1, wavelengthCal, unitS0, this, goniometer, angle, U, addAnglesToReflections);
          if (!positionsCalculated[exptID]){
            positionsCalculated[exptID] = [];
          }
          positionsCalculated[exptID].push(rlp.x);
          positionsCalculated[exptID].push(rlp.y);
          positionsCalculated[exptID].push(rlp.z);

          if ("crystalID" in panelReflection){
            // Reflection has been assigned to a crystal
            const crystalID = panelReflection["crystalID"];
            if (!(crystalID in crystalPositionsCalculated)){
              crystalPositionsCalculated[crystalID] = [];
            }
            crystalPositionsCalculated[crystalID].push(rlp.x);
            crystalPositionsCalculated[crystalID].push(rlp.y);
            crystalPositionsCalculated[crystalID].push(rlp.z);
          }

          if ("summedIntensity" in panelReflection) {
            // Reflection has been integrated
            // If any calculated integration data exists, remove it
            if (Object.keys(this.refl.calculatedIntegratedPanelReflData).length !== 0 && !ignoreIntegratedReflections){
              this.refl.calculatedIntegratedPanelReflData = {}
            }
            if (!positionsIntegrated[exptID]){
              positionsIntegrated[exptID] = [];
            }
            positionsIntegrated[exptID].push(rlp.x);
            positionsIntegrated[exptID].push(rlp.y);
            positionsIntegrated[exptID].push(rlp.z);

            if ("crystalID" in panelReflection){
              // Reflection has been assigned to a crystal
              const crystalID = panelReflection["crystalID"];
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


    /*
     * Now create actual sprites
     * Each ReflectionSet is a set of reflections at a given orientation, 
     * or for a given crystal. These are then grouped into MeshCollections
     * based on if they are unindexed, indexed, calculated, integrated
     */

    const unindexedReflectionSets = {};
    for (const [exptID, positions] of Object.entries(positionsUnindexed)) {
      const color = this.colors["reflectionUnindexed"][parseInt(exptID) % this.colors["reflectionUnindexed"].length];
      const visible = this.unindexedReflectionsCheckbox.checked && this.visibleExptIDs[exptID];
      const reflectionSet = new ReflectionSet(positions, color, this.reflectionSize.value, this.reflSprite, visible);
      unindexedReflectionSets[exptID] = reflectionSet;
    }
    this.unindexedReflections = new MeshCollection(unindexedReflectionSets);

    const indexedReflectionSets = {};
    for (const [exptID, positions] of Object.entries(positionsIndexed)) {
      const color = this.colors["reflectionIndexed"];
      const visible = this.indexedReflectionsCheckbox.checked && this.visibleExptIDs[exptID];
      const reflectionSet = new ReflectionSet(positions, color, this.reflectionSize.value, this.reflSprite, visible);
      indexedReflectionSets[exptID] = reflectionSet;
    }
    this.indexedReflections = new MeshCollection(indexedReflectionSets);

    const calculatedReflectionSets = {};
    for (const [exptID, positions] of Object.entries(positionsCalculated)) {
      const color = this.colors["reflectionCalculated"];
      const visible = this.calculatedReflectionsCheckbox.checked && this.visibleExptIDs[exptID];
      const reflectionSet = new ReflectionSet(positions, color, this.reflectionSize.value, this.reflSprite, visible);
      calculatedReflectionSets[exptID] = reflectionSet;
    }
    this.calculatedReflections = new MeshCollection(calculatedReflectionSets);

    const integratedReflectionSets = {};
    for (const [exptID, positions] of Object.entries(positionsIntegrated)) {
      const color = this.colors["reflectionIntegrated"];
      const visible = this.integratedReflectionsCheckbox.checked && this.visibleExptIDs[exptID];
      const reflectionSet = new ReflectionSet(positions, color, this.reflectionSize.value, this.reflSprite, visible);
      integratedReflectionSets[exptID] = reflectionSet;
    }
    this.integratedReflections = new MeshCollection(integratedReflectionSets);

    const crystalIndexedReflectionSets = {};
    for (const [crystalID, positions] of Object.entries(crystalPositionsIndexed)) {
      let color;
      if (crystalID === "-1"){
        color = this.colors["reflectionCrystalUnindexed"];
      }
      else{
        color = this.colors["reflectionCrystalIndexed"][parseInt(crystalID) % this.colors["reflectionCrystalIndexed"].length];

      }
      const visible = this.unindexedReflectionsCheckbox.checked && this.visibleCrystalIDs[crystalID];
      const reflectionSet = new ReflectionSet(positions, color, this.reflectionSize.value, this.reflSprite, visible);
      crystalIndexedReflectionSets[crystalID] = reflectionSet;
    }
    this.crystalIndexedReflections = new MeshCollection(crystalIndexedReflectionSets);

    const crystalCalculatedReflectionSets = {};
    for (const [crystalID, positions] of Object.entries(crystalPositionsCalculated)) {
      const color = this.colors["reflectionCalculated"];
      const visible = this.calculatedReflectionsCheckbox.checked && this.visibleCrystalIDs[crystalID];
      const reflectionSet = new ReflectionSet(positions, color, this.reflectionSize.value, this.reflSprite, visible);
      crystalCalculatedReflectionSets[crystalID] = reflectionSet;
    }
    this.crystalCalculatedReflections = new MeshCollection(crystalCalculatedReflectionSets);

    const crystalIntegratedReflectionSets = {};
    for (const [crystalID, positions] of Object.entries(crystalPositionsIntegrated)) {
      const color = this.colors["reflectionIntegrated"];
      const visible = this.integratedReflectionsCheckbox.checked && this.visibleCrystalIDs[crystalID];
      const reflectionSet = new ReflectionSet(positions, color, this.reflectionSize.value, this.reflSprite, visible);
      crystalIntegratedReflectionSets[crystalID] = reflectionSet;
    }
    this.crystalIntegratedReflections = new MeshCollection(crystalIntegratedReflectionSets);
    this.updateReflectionCheckboxStatus();
    this.setDefaultReflectionsDisplay();
    this.updateReflectionsVisibility();
    if (this.crystalView){
      this.switchToCrystalView();
    }
    else{
      this.switchToOrientationView();
    }
    this.requestRender();
  }
  
  addReflectionsFromJSONMsgpack(reflMsgpack, ignoreIntegratedReflections=false) {

    function getRLP(s1, wavelength, unitS0, viewer, goniometer, angle, U) {

      const rlp = s1.clone().normalize().sub(unitS0.clone().normalize()).multiplyScalar(1 / wavelength);

      if (angle == null || goniometer == null) {
        return rlp.multiplyScalar(viewer.rLPScaleFactor);
      }

      var fixedRotation = goniometer["fixedRotation"];
      const settingRotation = goniometer["settingRotation"];
      const rotationAxis = goniometer["rotationAxis"];

      if (window.viewer.crystalFrame && U !== null){
        fixedRotation = fixedRotation.clone().multiply(U);
      }
      rlp.applyMatrix3(settingRotation.clone().invert());
      rlp.applyAxisAngle(rotationAxis, -angle);
      rlp.applyMatrix3(fixedRotation.clone().invert().transpose());
      return rlp.multiplyScalar(viewer.rLPScaleFactor);
    }

    this.clearReflectionTable();
    this.refl.parseReflectionTableFromJSONMsgpack(reflMsgpack);

    if (!ignoreIntegratedReflections){
      this.refl.calculatedIntegratedPanelReflData = {};
      this.integratedReflectionsFromCalculated = false;
    }
    if (!this.hasExperiment()) {
      console.warn("Tried to add reflections but no experiment has been loaded");
      return;
    }

    this.refl.parseReflectionTableFromJSONMsgpack(reflMsgpack);

    // Get relevant data
    const panelNumbers = this.refl.getPanelNumbers();
    // Assume all reflection tables contain panel info
    if (panelNumbers === null){
      console.warn("Tried to add reflections but no data was parsed in refl file");
    }
    const xyzObs = this.refl.getXYZObs();
    const xyzObsMm = this.refl.getXYZObsMm();
    const xyzCal = this.refl.getXYZCal();
    const xyzCalMm = this.refl.getXYZCalMm();
    const millerIndices = this.refl.getMillerIndices();
    const exptIDs = this.refl.getExperimentIDs();
    let imagesetIDs = this.refl.getImagesetIDs();
    if (imagesetIDs === null){
      imagesetIDs = exptIDs;
    }
    const wavelengths = this.refl.getWavelengths()
    const wavelengthsCal = this.refl.getCalculatedWavelengths();
    const flags = this.refl.getFlags();

    const positionsUnindexed = {};
    const positionsIndexed = {};
    const positionsCalculated = {};
    const positionsIntegrated = {};
    const crystalPositionsIndexed = {};
    const crystalPositionsCalculated = {};
    const crystalPositionsIntegrated = {};

    const crystalIDsMap = this.expt.getCrystalIDsMap()

    const uniquePanelIdxs = new Set(panelNumbers);
    let panelData = {};
    for (const panelIdx of uniquePanelIdxs){
      panelData[panelIdx] = this.expt.getDetectorPanelDataByIdx(0, panelIdx);
    }

    // Get positions of all reflections
    for (let reflIdx = 0; reflIdx < panelNumbers.length; reflIdx++){

      // exptID
      let exptID;
      if (exptIDs !== null){
        exptID = exptIDs[reflIdx];
      }
      else{
        exptID = 0;
      }

      // imagesetID
      let imagesetID;
      if (imagesetIDs !== null){
        imagesetID = imagesetIDs[reflIdx];
      }
      else{
        imagesetID = 0;
      }

      let crystalID = crystalIDsMap[exptID];
      if (crystalID === undefined || crystalID === null){
        crystalID = "-1";
      }

      const scan = this.expt.experiments[imagesetID].scan;
      const goniometer = this.expt.experiments[imagesetID].goniometer;
      const addAnglesToReflections = (goniometer !== null && scan !== null);

      const panelIdx = parseInt(panelNumbers[reflIdx]);

      const pxSize = [panelData[panelIdx]["pxSize"].x, panelData[panelIdx]["pxSize"].y];
      const dMatrix = panelData[panelIdx]["dMatrix"];

      let reflWavelength = this.expt.getBeamData(imagesetID)["wavelength"];
      let reflWavelengthCal = this.expt.getBeamData(imagesetID)["wavelength"];
      const unitS0 = this.expt.getBeamDirection(imagesetID).multiplyScalar(-1).normalize();

      if (xyzObs !== null) {

        // Reflection contains observed position data
        const reflXyzObs = xyzObs[reflIdx];

        if (wavelengths !== null) {
          reflWavelength = wavelengths[reflIdx];
        }
        if (!reflWavelength) {
          // Wavelength not found in reflection data or beam data
          continue;
        }

        const s1 = this.getS1(reflXyzObs, dMatrix, reflWavelength, pxSize);
        let angle = 0;
        if (xyzObsMm !== null && addAnglesToReflections){
          angle = xyzObsMm[reflIdx][2];
        }
        var U = null;
        if (crystalID !== "-1"){
          U = this.expt.getCrystalU(crystalID);
        }
        const rlp = getRLP(s1, reflWavelength, unitS0, this, goniometer, angle, U);

        if (millerIndices !== null && this.refl.isValidMillerIndex(millerIndices[reflIdx])) {
          // Indexed reflection
          if (!positionsIndexed[imagesetID]){
            positionsIndexed[imagesetID] = [];
          }
          positionsIndexed[imagesetID].push(rlp.x);
          positionsIndexed[imagesetID].push(rlp.y);
          positionsIndexed[imagesetID].push(rlp.z);
        }
        else { 
          // Unindexed reflection
          if (!positionsUnindexed[imagesetID]){
            positionsUnindexed[imagesetID] = [];
          }
          positionsUnindexed[imagesetID].push(rlp.x);
          positionsUnindexed[imagesetID].push(rlp.y);
          positionsUnindexed[imagesetID].push(rlp.z);
        }

        // Reflection has been assigned to a crystal
        if (!(crystalID in crystalPositionsIndexed)){
          crystalPositionsIndexed[crystalID] = [];
        }
        crystalPositionsIndexed[crystalID].push(rlp.x);
        crystalPositionsIndexed[crystalID].push(rlp.y);
        crystalPositionsIndexed[crystalID].push(rlp.z);
      }

      if (xyzCal !== null && xyzCalMm !== null) {
        // Reflection contains calculated position data
        const reflXyzCal = xyzCal[reflIdx];
        if (wavelengthsCal !== null) {
          reflWavelengthCal = wavelengthsCal[reflIdx];
        }
        if (!reflWavelengthCal) {
          continue;
        }
        const s1 = this.getS1(reflXyzCal, dMatrix, reflWavelengthCal, pxSize);
        let angle = 0;
        if (xyzCalMm !== null && addAnglesToReflections){
          angle = xyzCalMm[reflIdx][2];
        }
        const rlp = getRLP(s1, reflWavelengthCal, unitS0, this, goniometer, angle, U, addAnglesToReflections);
        if (!positionsCalculated[imagesetID]){
          positionsCalculated[imagesetID] = [];
        }
        positionsCalculated[imagesetID].push(rlp.x);
        positionsCalculated[imagesetID].push(rlp.y);
        positionsCalculated[imagesetID].push(rlp.z);

        if (crystalID !== "-1"){
          // Reflection has been assigned to a crystal
          if (!(crystalID in crystalPositionsCalculated)){
            crystalPositionsCalculated[crystalID] = [];
          }
          crystalPositionsCalculated[crystalID].push(rlp.x);
          crystalPositionsCalculated[crystalID].push(rlp.y);
          crystalPositionsCalculated[crystalID].push(rlp.z);
        }

        if (this.refl.isSummationIntegrated(flags[reflIdx])) {
          // Reflection has been integrated
          // If any calculated integration data exists, remove it
          if (Object.keys(this.refl.calculatedIntegratedPanelReflData).length !== 0 && !ignoreIntegratedReflections){
            this.refl.calculatedIntegratedPanelReflData = {}
          }
          if (!positionsIntegrated[imagesetID]){
            positionsIntegrated[imagesetID] = [];
          }
          positionsIntegrated[imagesetID].push(rlp.x);
          positionsIntegrated[imagesetID].push(rlp.y);
          positionsIntegrated[imagesetID].push(rlp.z);

          if (crystalID !== "-1"){
            // Reflection has been assigned to a crystal
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


    /*
     * Now create actual sprites
     * Each ReflectionSet is a set of reflections at a given orientation, 
     * or for a given crystal. These are then grouped into MeshCollections
     * based on if they are unindexed, indexed, calculated, integrated
     */

    const unindexedReflectionSets = {};
    for (const [imagesetID, positions] of Object.entries(positionsUnindexed)) {
      const color = this.colors["reflectionUnindexed"][parseInt(imagesetID) % this.colors["reflectionUnindexed"].length];
      const visible = this.unindexedReflectionsCheckbox.checked && this.visibleExptIDs[imagesetID];
      const reflectionSet = new ReflectionSet(positions, color, this.reflectionSize.value, this.reflSprite, visible);
      unindexedReflectionSets[imagesetID] = reflectionSet;
    }
    this.unindexedReflections = new MeshCollection(unindexedReflectionSets);

    const indexedReflectionSets = {};
    for (const [imagesetID, positions] of Object.entries(positionsIndexed)) {
      const color = this.colors["reflectionIndexed"];
      const visible = this.indexedReflectionsCheckbox.checked && this.visibleExptIDs[imagesetID];
      const reflectionSet = new ReflectionSet(positions, color, this.reflectionSize.value, this.reflSprite, visible);
      indexedReflectionSets[imagesetID] = reflectionSet;
    }
    this.indexedReflections = new MeshCollection(indexedReflectionSets);

    const calculatedReflectionSets = {};
    for (const [imagesetID, positions] of Object.entries(positionsCalculated)) {
      const color = this.colors["reflectionCalculated"];
      const visible = this.calculatedReflectionsCheckbox.checked && this.visibleExptIDs[imagesetID];
      const reflectionSet = new ReflectionSet(positions, color, this.reflectionSize.value, this.reflSprite, visible);
      calculatedReflectionSets[imagesetID] = reflectionSet;
    }
    this.calculatedReflections = new MeshCollection(calculatedReflectionSets);

    const integratedReflectionSets = {};
    for (const [imagesetID, positions] of Object.entries(positionsIntegrated)) {
      const color = this.colors["reflectionIntegrated"];
      const visible = this.integratedReflectionsCheckbox.checked && this.visibleExptIDs[imagesetID];
      const reflectionSet = new ReflectionSet(positions, color, this.reflectionSize.value, this.reflSprite, visible);
      integratedReflectionSets[imagesetID] = reflectionSet;
    }
    this.integratedReflections = new MeshCollection(integratedReflectionSets);

    const crystalIndexedReflectionSets = {};
    for (const [crystalID, positions] of Object.entries(crystalPositionsIndexed)) {
      let color;
      if (crystalID === "-1"){
        color = this.colors["reflectionCrystalUnindexed"];
      }
      else{
        color = this.colors["reflectionCrystalIndexed"][parseInt(crystalID) % this.colors["reflectionCrystalIndexed"].length];

      }
      const visible = this.unindexedReflectionsCheckbox.checked && this.visibleCrystalIDs[crystalID];
      const reflectionSet = new ReflectionSet(positions, color, this.reflectionSize.value, this.reflSprite, visible);
      crystalIndexedReflectionSets[crystalID] = reflectionSet;
    }
    this.crystalIndexedReflections = new MeshCollection(crystalIndexedReflectionSets);

    const crystalCalculatedReflectionSets = {};
    for (const [crystalID, positions] of Object.entries(crystalPositionsCalculated)) {
      const color = this.colors["reflectionCalculated"];
      const visible = this.calculatedReflectionsCheckbox.checked && this.visibleCrystalIDs[crystalID];
      const reflectionSet = new ReflectionSet(positions, color, this.reflectionSize.value, this.reflSprite, visible);
      crystalCalculatedReflectionSets[crystalID] = reflectionSet;
    }
    this.crystalCalculatedReflections = new MeshCollection(crystalCalculatedReflectionSets);

    const crystalIntegratedReflectionSets = {};
    for (const [crystalID, positions] of Object.entries(crystalPositionsIntegrated)) {
      const color = this.colors["reflectionIntegrated"];
      const visible = this.integratedReflectionsCheckbox.checked && this.visibleCrystalIDs[crystalID];
      const reflectionSet = new ReflectionSet(positions, color, this.reflectionSize.value, this.reflSprite, visible);
      crystalIntegratedReflectionSets[crystalID] = reflectionSet;
    }
    this.crystalIntegratedReflections = new MeshCollection(crystalIntegratedReflectionSets);
    this.updateReflectionCheckboxStatus();
    this.setDefaultReflectionsDisplay();
    this.updateReflectionsVisibility();
    if (this.crystalView){
      this.switchToCrystalView();
    }
    else{
      this.switchToOrientationView();
    }
    this.requestRender();
  }
  
  addCalculatedIntegratedReflectionsFromJSONMsgpack(reflMsgpack) {

    function getRLP(s1, wavelength, unitS0, viewer, goniometer, angle, U) {

      const rlp = s1.clone().normalize().sub(unitS0.clone().normalize()).multiplyScalar(1 / wavelength);

      if (angle == null || goniometer == null) {
        return rlp.multiplyScalar(viewer.rLPScaleFactor);
      }

      var fixedRotation = goniometer["fixedRotation"];
      const settingRotation = goniometer["settingRotation"];
      const rotationAxis = goniometer["rotationAxis"];

      if (window.viewer.crystalFrame && U !== null){
        fixedRotation = fixedRotation.clone().multiply(U);
      }
      rlp.applyMatrix3(settingRotation.clone().invert());
      rlp.applyAxisAngle(rotationAxis, -angle);
      rlp.applyMatrix3(fixedRotation.clone().invert().transpose());
      return rlp.multiplyScalar(viewer.rLPScaleFactor);
    }

    this.integratedReflections.destroy();
    this.crystalIntegratedReflections.destroy();

    if (!this.hasExperiment()) {
      console.warn("Tried to add reflections but no experiment has been loaded");
      return;
    }

    this.calculatedIntegratedRefl.parseReflectionTableFromJSONMsgpack(reflMsgpack);

    // Get relevant data
    const panelNumbers = this.calculatedIntegratedRefl.getPanelNumbers();
    // Assume all reflection tables contain panel info
    if (panelNumbers === null){
      console.warn("Tried to add reflections but no data was parsed in refl file");
    }
    const xyzCal = this.calculatedIntegratedRefl.getXYZCal();
    const xyzCalMm = this.calculatedIntegratedRefl.getXYZCalMm();
    const exptIDs = this.calculatedIntegratedRefl.getExperimentIDs();
    const imagesetIDs = this.calculatedIntegratedRefl.getImagesetIDs();
    const wavelengthsCal = this.calculatedIntegratedRefl.getCalculatedWavelengths();
    const crystalIDsMap = this.expt.getCrystalIDsMap()

    const positionsIntegrated = {};
    const crystalPositionsIntegrated = {};

    const uniquePanelIdxs = new Set(panelNumbers);
    let panelData = {};
    for (const panelIdx of uniquePanelIdxs){
      panelData[panelIdx] = this.expt.getDetectorPanelDataByIdx(0, panelIdx);
    }

    // Get positions of all reflections
    for (let reflIdx = 0; reflIdx < panelNumbers.length; reflIdx++){

      // exptID
      let exptID;
      if (exptIDs !== null){
        exptID = exptIDs[reflIdx];
      }
      else{
        exptID = 0;
      }
      
      // imagesetID
      let imagesetID;
      if (imagesetIDs !== null){
        imagesetID = imagesetIDs[reflIdx];
      }
      else{
        imagesetID = 0;
      }
      const crystalID = crystalIDsMap[exptID];
      const scan = this.expt.experiments[imagesetID].scan;
      const goniometer = this.expt.experiments[imagesetID].goniometer;
      const addAnglesToReflections = (goniometer !== null && scan !== null);

      const panelIdx = parseInt(panelNumbers[reflIdx]);

      const pxSize = [panelData[panelIdx]["pxSize"].x, panelData[panelIdx]["pxSize"].y];
      const dMatrix = panelData[panelIdx]["dMatrix"];

      let reflWavelengthCal = this.expt.getBeamData(imagesetID)["wavelength"];
      const unitS0 = this.expt.getBeamDirection(imagesetID).multiplyScalar(-1).normalize();


      if (xyzCal !== null && xyzCalMm !== null) {
        // Reflection contains calculated position data
        const reflXyzCal = xyzCal[reflIdx];
        if (wavelengthsCal !== null) {
          reflWavelengthCal = wavelengthsCal[reflIdx];
        }
        if (!reflWavelengthCal) {
          continue;
        }
        const s1 = this.getS1(reflXyzCal, dMatrix, reflWavelengthCal, pxSize);
        let angle = 0;
        if (xyzCalMm !== null && addAnglesToReflections){
          angle = xyzCalMm[reflIdx][2];
        }
        var U = null;
        if (crystalID !== "-1"){
          U = this.expt.getCrystalU(crystalID);
        }
        const rlp = getRLP(s1, reflWavelengthCal, unitS0, this, goniometer, angle, U, addAnglesToReflections);

        if (!positionsIntegrated[imagesetID]){
          positionsIntegrated[imagesetID] = [];
        }
        positionsIntegrated[imagesetID].push(rlp.x);
        positionsIntegrated[imagesetID].push(rlp.y);
        positionsIntegrated[imagesetID].push(rlp.z);

        if (crystalID !== "-1"){
          // Reflection has been assigned to a crystal
          if (!(crystalID in crystalPositionsIntegrated)){
            crystalPositionsIntegrated[crystalID] = [];
          }
          crystalPositionsIntegrated[crystalID].push(rlp.x);
          crystalPositionsIntegrated[crystalID].push(rlp.y);
          crystalPositionsIntegrated[crystalID].push(rlp.z);
        }
      }
    }


    /*
     * Now create actual sprites
     * Each ReflectionSet is a set of reflections at a given orientation, 
     * or for a given crystal. These are then grouped into MeshCollections
     */


    const integratedReflectionSets = {};
    for (const [imagesetID, positions] of Object.entries(positionsIntegrated)) {
      const color = this.colors["reflectionIntegrated"];
      const visible = this.integratedReflectionsCheckbox.checked && this.visibleExptIDs[imagesetID];
      const reflectionSet = new ReflectionSet(positions, color, this.reflectionSize.value, this.reflSprite, visible);
      integratedReflectionSets[imagesetID] = reflectionSet;
    }
    this.integratedReflections = new MeshCollection(integratedReflectionSets);

    const crystalIntegratedReflectionSets = {};
    for (const [crystalID, positions] of Object.entries(crystalPositionsIntegrated)) {
      const color = this.colors["reflectionIntegrated"];
      const visible = this.integratedReflectionsCheckbox.checked && this.visibleCrystalIDs[crystalID];
      const reflectionSet = new ReflectionSet(positions, color, this.reflectionSize.value, this.reflSprite, visible);
      crystalIntegratedReflectionSets[crystalID] = reflectionSet;
    }
    this.crystalIntegratedReflections = new MeshCollection(crystalIntegratedReflectionSets);
    this.updateReflectionCheckboxStatus();
    this.updateReflectionsVisibility();
    if (this.crystalView){
      this.switchToCrystalView();
    }
    else{
      this.switchToOrientationView();
    }
    this.integratedReflectionsFromCalculated = true;
    this.requestRender();
  }


  addCalculatedIntegratedReflectionsFromData(reflData) {

    function getRLP(s1, wavelength, unitS0, viewer, goniometer, angle, U, addAnglesToReflections) {

      const rlp = s1.clone().normalize().sub(unitS0.clone().normalize()).multiplyScalar(1 / wavelength);

      if (!addAnglesToReflections) {
        return rlp.multiplyScalar(viewer.rLPScaleFactor);
      }
      if (angle == null) {
        console.warn("Rotation angles not in reflection table. Cannot generate rlps correctly if rotation experiment.");
        return rlp.multiplyScalar(viewer.rLPScaleFactor);
      }
      var fixedRotation = goniometer["fixedRotation"];
      const settingRotation = goniometer["settingRotation"];
      const rotationAxis = goniometer["rotationAxis"];

      if (window.viewer.crystalFrame && U !== null){
        fixedRotation = fixedRotation.clone().multiply(U);
      }
      rlp.applyMatrix3(settingRotation.clone().invert());
      rlp.applyAxisAngle(rotationAxis, -angle);
      rlp.applyMatrix3(fixedRotation.clone().invert().transpose());
      return rlp.multiplyScalar(viewer.rLPScaleFactor);
    }

    if (Object.keys(reflData).length == 0){
      return;
    }

    this.integratedReflections.destroy();
    this.crystalIntegratedReflections.destroy();
    this.refl.calculatedIntegratedPanelReflData = reflData;
    this.integratedReflectionsFromCalculated = true;

    if (!this.hasExperiment()) {
      console.warn("Tried to add reflections but no experiment has been loaded");
      return;
    }
    const panelKeys = Object.keys(reflData);

    const positionsIntegrated = {};
    const crystalPositionsIntegrated = {};

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

      for (var j = 0; j < panelReflections.length; j++) {

        const panelReflection = panelReflections[j];
        const exptID = panelReflection["exptID"];
        var wavelength = this.expt.getBeamData(exptID)["wavelength"];
        var wavelengthCal = this.expt.getBeamData(exptID)["wavelength"];
        var unitS0 = this.expt.getBeamDirection(exptID).multiplyScalar(-1).normalize();
        var goniometer = this.expt.experiments[exptID].goniometer;


        if ("xyzCal" in panelReflection) {
          // Reflection contains calculated position data
          const xyzCal = panelReflection["xyzCal"];
          if ("wavelengthCal" in panelReflection) {
            wavelengthCal = panelReflection["wavelengthCal"];
          }
          if (!wavelengthCal) {
            continue;
          }
          const s1 = this.getS1(xyzCal, dMatrix, wavelengthCal, pxSize);
          const angle = panelReflection["angleCal"];
          var U = null;
          if ("crystalID" in panelReflection && panelReflection["crystalID"] !== "-1"){
            U = this.expt.getCrystalU(parseInt(panelReflection["crystalID"]))
          }
          const rlp = getRLP(s1, wavelengthCal, unitS0, this, goniometer, angle, U, addAnglesToReflections);

          // Reflection has been integrated
          if (!positionsIntegrated[exptID]){
            positionsIntegrated[exptID] = [];
          }
          positionsIntegrated[exptID].push(rlp.x);
          positionsIntegrated[exptID].push(rlp.y);
          positionsIntegrated[exptID].push(rlp.z);

          if ("crystalID" in panelReflection){
            // Reflection has been assigned to a crystal
            const crystalID = panelReflection["crystalID"];
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


    /*
     * Now create actual sprites
     * Each ReflectionSet is a set of reflections at a given orientation, 
     * or for a given crystal. These are then grouped into MeshCollections
     * based on if they are unindexed, indexed, calculated, integrated
     */

    const integratedReflectionSets = {};
    for (const [exptID, positions] of Object.entries(positionsIntegrated)) {
      const color = this.colors["reflectionIntegrated"];
      const visible = this.integratedReflectionsCheckbox.checked && this.visibleExptIDs[exptID];
      const reflectionSet = new ReflectionSet(positions, color, this.reflectionSize.value, this.reflSprite, visible);
      integratedReflectionSets[exptID] = reflectionSet;
    }
    this.integratedReflections = new MeshCollection(integratedReflectionSets);

    const crystalIntegratedReflectionSets = {};
    for (const [crystalID, positions] of Object.entries(crystalPositionsIntegrated)) {
      const color = this.colors["reflectionIntegrated"];
      const visible = this.integratedReflectionsCheckbox.checked && this.visibleCrystalIDs[crystalID];
      const reflectionSet = new ReflectionSet(positions, color, this.reflectionSize.value, this.reflSprite, visible);
      crystalIntegratedReflectionSets[crystalID] = reflectionSet;
    }
    this.crystalIntegratedReflections = new MeshCollection(crystalIntegratedReflectionSets);
    this.updateReflectionCheckboxStatus();
    this.updateReflectionsVisibility();
    if (this.crystalView){
      this.switchToCrystalView();
    }
    else{
      this.switchToOrientationView();
    }
    this.requestRender();
  }

  addReflections() {
    this.addReflectionsFromData(this.refl.reflData);
  }

  clearMesh() {
    if (this.currentMesh !== null){
      window.scene.remove(this.currentMesh);
      this.currentMesh.geometry.dispose();
      this.currentMesh.material.dispose();
      if (this.currentMesh.isInstancedMesh) {
          this.currentMesh.count = 0;
          this.currentMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
          this.currentMesh.instanceMatrix.needsUpdate = true;
      }
      this.currentMesh = null;
    }

    this.meshData = null;
    this.meshShape = null;
    this.rLPMin = null;
    this.rLPMax = null;
    this.rLPStep = null;
    this.requestRender();
  }

  createSignedDistanceFunction(meshData, meshShape, isovalue) {
    return function (x, y, z) {
        let xi = Math.floor(x);
        let yi = Math.floor(y);
        let zi = Math.floor(z);
        if (xi < 0 || yi < 0 || zi < 0 || xi >= meshShape[0] || yi >= meshShape[1] || zi >= meshShape[2]) {
            return -1; 
        }
        return meshData[zi][yi][xi] - isovalue; 
    };

  }

  updateMaxResolution(){
    this.clearMesh();
    const resolution = document.getElementById("maxResolutionSlider").value;

		const data = JSON.stringify(
				{
					"channel" : "server",
					"command" : "update_rs_mapper_mesh",
					"max_resolution" : resolution
				}
			);
		this.serverWS.send(data);

  }

  updateMeshVisibility(val){
    if (this.currentMesh !== null){
      this.currentMesh.visible = val
      this.requestRender();
    }

    const meshThresholdContainer = document.getElementById("meshThresholdContainer");
    const maxResolutionContainer = document.getElementById("maxResolutionContainer");
  
    const displayVal = val ? "block" : "none"; 
  
    if (meshThresholdContainer) meshThresholdContainer.style.display = displayVal;
    if (maxResolutionContainer) maxResolutionContainer.style.display = displayVal;
  
    this.reciprocalMeshVisible = val;
  }

  updateMesh(){
    if (this.meshData === null || this.meshShape === null){
      return;
    }
    if (this.rLPMin === null || this.rLPMax === null || this.rLPStep === null){
      return;
    }
    const meshData = this.meshData;
    const meshShape = this.meshShape;
    const rLPMin = this.rLPMin;
    const rLPMax = this.rLPMax;
    const rLPStep = this.rLPStep;
    this.clearMesh();
    this.addContourMeshFromData(meshData, meshShape, rLPMin, rLPMax, rLPStep);
  }

  addContourMeshFromData(data, meshShape, rLPMin, rLPMax, rLPStep) {
    this.meshData = data;
    this.meshShape = meshShape;
    this.rLPMin = rLPMin;
    this.rLPMax = rLPMax;
    this.rLPStep = rLPStep;

    const isovalue = document.getElementById("meshThresholdSlider").value;
    this.loading=true;
      data = ExptParser.decompressImageData(data, meshShape);
      const sdf = this.createSignedDistanceFunction(data, meshShape, isovalue);

      const resolution = 64;
      const scanBounds = [[0,0,0], [meshShape[0], meshShape[1], meshShape[2]]];

      const result = marchingCubes(resolution, sdf, scanBounds);
      const positions = result.positions;
      const meshScaleFactor = this.rLPScaleFactor;

      for (let i = 0; i < positions.length; i++) {
        const x = positions[i][0];
        const y = positions[i][1];
        const z = positions[i][2];

        // Reassign in z, y, x order
        positions[i][0] = ((z - meshShape[2] / 2) * rLPStep) * meshScaleFactor; 
        positions[i][1] = ((y - meshShape[1] / 2) * rLPStep) * meshScaleFactor; 
        positions[i][2] = ((x - meshShape[0] / 2) * rLPStep) * meshScaleFactor; 
      }

      const vertices = new Float32Array(positions.flat());
      const geometry = new THREE.BufferGeometry();
      const indices = new Uint32Array(result.cells.flat());

      geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();

      const material = new THREE.MeshBasicMaterial({
      color: this.colors["reciprocalMesh"],
      wireframe: true,
      });


      const contourMesh = new THREE.Mesh(geometry, material);
      window.scene.add(contourMesh);
      this.currentMesh = contourMesh;
      this.requestRender();
      this.loading=false;
  }

  setDefaultReflectionsDisplay() {

    this.indexedReflectionsCheckbox.checked = false;
    this.unindexedReflectionsCheckbox.checked = false;
    this.calculatedReflectionsCheckbox.checked = false;
    this.integratedReflectionsCheckbox.checked = false;
    this.crystalFrameCheckbox.checked = false;
    if (!this.hasReflectionTable()) {
      return;
    }

    if (!this.unindexedReflections.empty()) {
      this.unindexedReflectionsCheckbox.checked = true;
    }
    if (!this.indexedReflections.empty()) {
      this.indexedReflectionsCheckbox.checked = true;
    }
    this.crystalFrameCheckbox.checked = this.crystalFrame;

    this.updateReflectionsVisibility();
  }
  
  updateReflectionCheckboxStatus() {
    if (!this.hasReflectionTable()) {
      this.indexedReflectionsCheckbox.disabled = true;
      this.unindexedReflectionsCheckbox.disabled = true;
      this.calculatedReflectionsCheckbox.disabled = true;
      this.integratedReflectionsCheckbox.disabled = true;
      this.crystalFrameCheckbox.disabled = true;
      return;
    }
    this.indexedReflectionsCheckbox.disabled = this.indexedReflections.empty();
    this.unindexedReflectionsCheckbox.disabled = this.unindexedReflections.empty();
    this.calculatedReflectionsCheckbox.disabled = this.calculatedReflections.empty();
    this.integratedReflectionsCheckbox.disabled = this.integratedReflections.empty();
    this.crystalFrameCheckbox.disabled = this.indexedReflections.empty();
  }

  updateReciprocalCellCheckboxStatus(){
    if (!this.hasExperiment()) {
      this.reciprocalCellCheckbox.disabled = true;
      this.crystalFrameCheckbox.disabled = true;
    }
    else{
      this.reciprocalCellCheckbox.disabled = (this.orientationReciprocalCells.empty() && this.crystalReciprocalCells.empty());
      this.crystalFrameCheckbox.disabled = (this.orientationReciprocalCells.empty() && this.crystalReciprocalCells.empty());
    }

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

  clearReciprocalCells(){
    this.orientationReciprocalCells.destroy();
    this.crystalReciprocalCells.destroy();
    this.reciprocalCellCheckbox.checked = false;
    this.reciprocalCellCheckbox.disabled = true;
    this.crystalFrameCheckbox.checked = false;
    this.crystalFrameCheckbox.disabled = true;
  }

  addReciprocalCells() {

    if (!this.expt.hasCrystal(0)) {
      return;
    }

    const reciprocalCellVisible = this.reciprocalCellCheckbox.checked;
    const crystalFrameChecked = this.crystalFrameCheckbox.checked;
    this.clearReciprocalCells();

    var crystalRLVs;
    if (this.crystalFrame){
      crystalRLVs = this.expt.getAllCrystalRCVs(); 
    }
    else{
      crystalRLVs = this.expt.getAllCrystalRLVs(); 
    }

    var orientationReciprocalCells = {};
    var crystalReciprocalCells = {};

    for (let i=0; i<crystalRLVs.length; i++){

      let crystalRLV = crystalRLVs[i];
      const avgRLVLength = (crystalRLV[0].length() + crystalRLV[1].length() + crystalRLV[2].length())/3.;

      const minLineWidth = ReciprocalLatticeViewer.sizes()["minRLVLineWidth"];
      const maxLineWidth = ReciprocalLatticeViewer.sizes()["maxRLVLineWidth"];
      const lineWidthScaleFactor = ReciprocalLatticeViewer.sizes()["RLVLineWidthScaleFactor"];
      const lineWidth = Math.min(
        Math.max(avgRLVLength * lineWidthScaleFactor, minLineWidth), maxLineWidth
      );
      const labelScaleFactor = Math.max(
        avgRLVLength * ReciprocalLatticeViewer.sizes()["RLVLabelScaleFactor"], 1
      );
      var fontSize = ReciprocalLatticeViewer.sizes()["minRLVLabelSize"];
      fontSize *= labelScaleFactor;
      crystalRLV[0].multiplyScalar(this.rLPScaleFactor);
      crystalRLV[1].multiplyScalar(this.rLPScaleFactor);
      crystalRLV[2].multiplyScalar(this.rLPScaleFactor);

      crystalReciprocalCells[i] = new ReciprocalCell(
        crystalRLV,
        this.colors["reflectionCrystalIndexed"][i % this.colors["reflectionCrystalIndexed"].length],
        lineWidth,
        fontSize
      );

      orientationReciprocalCells[i] = new ReciprocalCell(
        crystalRLV,
        this.colors["reciprocalCell"],
        lineWidth,
        fontSize
      );
    }

    this.orientationReciprocalCells = new MeshCollection(orientationReciprocalCells);
    this.crystalReciprocalCells = new MeshCollection(crystalReciprocalCells);

    this.updateReciprocalCellCheckboxStatus();
    this.reciprocalCellCheckbox.checked = reciprocalCellVisible;
    this.crystalFrameCheckbox.checked = crystalFrameChecked;
    this.updateReciprocalCellsVisibility();
    this.requestRender();

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
          arr[3 * idx] / viewer.rLPScaleFactor,
          arr[(3 * idx) + 1] / viewer.rLPScaleFactor,
          arr[(3 * idx) + 2] / viewer.rLPScaleFactor
        );
        return (1 / rlp.length()).toFixed(3);
      }

      if (viewer.indexedReflectionsCheckbox.checked) {
        let meshCollection;
        if (viewer.crystalView){
          meshCollection = viewer.crystalIndexedReflections;
        }
        else{
          meshCollection = viewer.indexedReflections;
        }

        for (const [id, reflectionSet] of meshCollection) {
          window.rayCaster.setFromCamera(window.mousePosition, window.camera);
          const intersects = window.rayCaster.intersectObjects(reflectionSet.points);
          if (intersects.length > 0) {
            for (var j = 0; j < intersects.length; j++) {
              const summary = viewer.refl.getIndexedSummaryById(intersects[j].index);
              viewer.displayHeaderText(
                summary + " <b>res: </b>" + getDSpacing(
                  reflectionSet.positions, intersects[j].index, viewer
                ) + " Angstrom"
              );
            }
          }
        }
      }


      if (viewer.unindexedReflectionsCheckbox.checked) {
        for (const [id, reflectionSet] of viewer.unindexedReflections) {
          const intersects = window.rayCaster.intersectObjects(reflectionSet.points);
          window.rayCaster.setFromCamera(window.mousePosition, window.camera);
          if (intersects.length > 0) {
            for (var j = 0; j < intersects.length; j++) {
              const summary = viewer.refl.getUnindexedSummaryById(intersects[j].index);
              viewer.displayHeaderText(
                summary + " <b>res: </b>" + getDSpacing(
                  reflectionSet.positions, intersects[j].index, viewer
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
		document.getElementById("selectionDropdown").classList.toggle("show");
    var dropdownIcon = document.getElementById("dropdownIcon");
    dropdownIcon.classList.toggle("fa-chevron-down");
    dropdownIcon.classList.toggle("fa-chevron-right"); 
	}

  toggleCrystalVisibility(crystalIDLabel){
    var crystalID = parseInt(crystalIDLabel.split("-").pop());
    this.visibleCrystalIDs[crystalID] = !this.visibleCrystalIDs[crystalID];
    this.updateReflectionsVisibility();
    this.updateReciprocalCellsVisibility();
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
    this.updateReflectionsVisibility();
  }

  updateExptIDVisibility(){
    if (this.crystalView){return;}
    for (const [exptID, visible] of Object.entries(this.visibleExptIDs)) {
      let dropdownIcon = document.getElementById("exptID-dropdown-icon-"+exptID.toString());
      if (!dropdownIcon.classList.contains("fa-check") && visible){
        dropdownIcon.classList.toggle("fa-check");
      }
      else if (dropdownIcon.classList.contains("fa-check") && !visible){
        dropdownIcon.classList.toggle("fa-check");
      }
    }
  }

  updateCrystalIDVisibility(){
    if (!this.crystalView){return;}
    for (const [crystalID, visible] of Object.entries(this.visibleCrystalIDs)) {
      let dropdownIcon = document.getElementById("crystalID-dropdown-icon-"+crystalID.toString());
      if (!dropdownIcon.classList.contains("fa-check") && visible){
        dropdownIcon.classList.toggle("fa-check");
      }
      else if (dropdownIcon.classList.contains("fa-check") && !visible){
        dropdownIcon.classList.toggle("fa-check");
      }
    }
  }

  toggleExptVisibility(exptIDLabel){
    var exptID = parseInt(exptIDLabel.split("-").pop());
    this.visibleExptIDs[exptID] = !this.visibleExptIDs[exptID];
    this.updateReflectionsVisibility();
    var dropdownIcon = document.getElementById("exptID-dropdown-icon-"+exptID.toString());
    dropdownIcon.classList.toggle("fa-check");
  }

  toggleAllExptVisibility(){
    var dropdownIcon = document.getElementById("exptID-dropdown-icon-all");
    dropdownIcon.classList.toggle("fa-check");
    var visible = dropdownIcon.classList.contains("fa-check");
    for (var exptID = 0; exptID < this.visibleExptIDs.length; exptID++){
      this.visibleExptIDs[exptID] = visible;
      var dropdownIcon = document.getElementById("exptID-dropdown-icon-"+exptID.toString());
      if (dropdownIcon.classList.contains("fa-check") !== visible){
        dropdownIcon.classList.toggle("fa-check");
      }
    }
    this.updateReflectionsVisibility();
  }

  clearSelectionDropdown(){
    var dropdownContent = document.getElementById("selectionDropdown");
    dropdownContent.innerHTML = ""; 
  }

  getCrystalIDs(){
    if (!this.crystalIndexedReflections.empty()){
      return this.crystalIndexedReflections.keys();
    }
    return ["-1"]
  }

  getCrystalLabels(){
    var crystalLabels = this.getCrystalIDs();
    crystalLabels = crystalLabels.map(id => id === "-1" ? "unindexed" : id);
    return crystalLabels;
  }

  setSelectionDropdownToCrystals(){
    var maxLabelSize = 22;
    var minNumForAllButton = 4;
    var crystalLabels = this.getCrystalLabels();
    var addAllButton = crystalLabels.length > minNumForAllButton;
    var firstLabel = null;
    const visibleCrystalIDs = {};
    var dropdownContent = document.getElementById("selectionDropdown");
    dropdownContent.innerHTML = ""; 

    for (var i = 0; i < crystalLabels.length; i++) {
      if (crystalLabels[i] === "unindexed"){
        continue;
      }
      var label = document.createElement("label");
      label.classList.add("experiment-label"); 
      var color = null;
      color = this.colors["reflectionCrystalIndexed"][parseInt(i) % this.colors["reflectionCrystalIndexed"].length];
      var hexColor = '#' + color.toString(16).padStart(6, '0');
      label.style.color = hexColor;
      
      var icon = document.createElement("i");
      icon.classList.add("fa", "fa-check"); 
      icon.style.float = "right"; 
      icon.id = "crystalID-dropdown-icon-"+i;
      
      var crystalLabel = crystalLabels[i];
      if (crystalLabel.length > maxLabelSize){
        crystalLabel = crystalLabel.slice(0,19) + "...";
      }
      label.textContent = crystalLabel;
      label.id = "crystalID-"+i;
      
      label.appendChild(icon);
      
      label.addEventListener('click', (event) => {
          this.toggleCrystalVisibility(event.target.id);
      });

      if (addAllButton && firstLabel === null){
        firstLabel = label;
      }

      dropdownContent.appendChild(label);
      dropdownContent.appendChild(document.createElement("br"));
      visibleCrystalIDs[i] = true;
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

  setSelectionDropdownToOrientations() {
    var maxLabelSize = 22;
    var minNumForAllButton = 4;

    var exptIDs = this.expt.getImagesetIDs();
    var exptLabels = this.expt.getExptLabels();
    var addAllButton = exptLabels.length > minNumForAllButton;
    var firstLabel = null;
    const visibleExpts = [];
    var dropdownContent = document.getElementById("selectionDropdown");
    dropdownContent.innerHTML = ""; 

    for (var i = 0; i < exptIDs.length; i++) {
        var label = document.createElement("label");
        label.classList.add("experiment-label"); 
        const color = this.colors["reflectionUnindexed"][exptIDs[i] % this.colors["reflectionUnindexed"].length];
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
    this.visibleExptIDs = visibleExpts;
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
  window.viewer.setCameraToDefaultPosition();
  window.viewer.requestRender();
}
