import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { gsap } from "gsap";
import { MeshLine, MeshLineMaterial, MeshLineRaycast } from 'three.meshline';
import { ExptParser } from "./ExptParser.js";
import { ReflParser } from "./ReflParser.js";

class ReciprocalLatticeViewer {
	constructor(exptParser, reflParser) {

		// Data parsers
		this.expt = exptParser;
		this.refl = reflParser;

		// Html elements
		this.headerText = window.document.getElementById("headerText");
		this.footerText = window.document.getElementById("footerText");
		this.sidebar = window.document.getElementById("sidebar");
		this.closeExptButton = document.getElementById("closeExpt");
		this.closeReflButton = document.getElementById("closeRefl");
		this.observedIndexedReflsCheckbox = document.getElementById("observedIndexedReflections");
		this.observedUnindexedReflsCheckbox = document.getElementById("observedUnindexedReflections");
		this.calculatedReflsCheckbox = document.getElementById("calculatedReflections");
		this.reciprocalCellCheckbox = document.getElementById("reciprocalCell");
		this.axesCheckbox = document.getElementById("showAxes");
		this.reflectionSize = document.getElementById("reflectionSize");

		// Bookkeeping for meshes
		this.reflPointsObsUnindexed = [];
		this.reflPositionsUnindexed = [];
		this.reflPointsObsIndexed = [];
		this.reflPositionsIndexed = [];
		this.reflPointsCal = [];
		this.reflPositionsCal = []
		this.beamMeshes = [];
		this.axesMeshes = [];
		this.sampleMesh = null;
		this.reciprocalCellMeshes = [];

		this.hightlightColor = new THREE.Color(ReciprocalLatticeViewer.colors()["highlight"]);
		this.reflectionUnindexedColor = new THREE.Color(ReciprocalLatticeViewer.colors()["reflectionObsUnindexed"]);
		this.reflectionInexedColor = new THREE.Color(ReciprocalLatticeViewer.colors()["reflectionObsIndexed"]);
		this.reflectionCalculatedColor = new THREE.Color(ReciprocalLatticeViewer.colors()["reflectionCal"]);

		this.rlpScaleFactor = 1000;

		this.displayingTextFromHTMLEvent = false;

		this.updateReflectionCheckboxStatus();
		this.setDefaultReflectionsDisplay();

	}

	static colors() {
		return {
			"background": 0x222222,
			"sample": 0xfdf6e3,
			"reflectionObsUnindexed": 0xFFFFFF,
			"reflectionObsIndexed": 0xe74c3c,
			"reflectionCal": 0xffaaaa,
			"highlight": 0xFFFFFF,
			"beam": 0xFFFFFF,
			"axes": [0xffaaaa, 0xaaffaa, 0xaaaaff],
			"reciprocalCell": 0x119dff
		};
	}

	static sizes(){
		return {
			"minRLVLineWidth" : 1,
			"maxRLVLineWidth" : 8,
			"minRLVLabelSize" : 18,
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
		this.reflPointsObsIndexed[0].visible = this.observedIndexedReflsCheckbox.checked;
		this.requestRender();
	}

	updateObservedUnindexedReflections(val = null) {
		if (val !== null) {
			this.observedUnindexedReflsCheckbox.checked = val;
		}
		this.reflPointsObsUnindexed[0].visible = this.observedUnindexedReflsCheckbox.checked;
		this.requestRender();
	}

	updateCalculatedReflections(val = null) {
		if (val !== null) {
			this.calculatedReflsCheckbox.checked = val;
		}
		if (this.reflPointsCal.length > 0) {
			this.reflPointsCal[0].visible = this.calculatedReflsCheckbox.checked;
			this.requestRender();
		}
	}

	updateAxes(val = null) {
		if (val !== null) {
			this.axesCheckbox.checked = val;
		}
		for (var i = 0; i < this.axesMeshes.length; i++) {
			this.axesMeshes[i].visible = this.axesCheckbox.checked;
		}
		this.requestRender();
	}

	updateReciprocalCell(val = null) {
		this.reciprocalCellCheckbox.disabled = !this.expt.hasCrystal();
		if (val !== null) {
			this.reciprocalCellCheckbox.checked = val;
		}
		for (var i = 0; i < this.reciprocalCellMeshes.length; i++) {
			this.reciprocalCellMeshes[i].visible = this.reciprocalCellCheckbox.checked;
		}
		this.requestRender();
	}

	updateReflectionSize() {
		if (!this.hasReflectionTable()) {
			return;
		}
		if (this.refl.containsXYZObs()) {
			if (this.reflPointsObsUnindexed) {
				const reflGeometryObs = new THREE.BufferGeometry();
				reflGeometryObs.setAttribute(
					"position", new THREE.Float32BufferAttribute(this.reflPositionsUnindexed, 3)
				);

				const reflMaterialObs = new THREE.PointsMaterial({
					size: this.reflectionSize.value,
					transparent: true,
					color: ReciprocalLatticeViewer.colors()["reflectionObsUnindexed"]
				});
				const pointsObs = new THREE.Points(reflGeometryObs, reflMaterialObs);
				this.clearReflPointsObsUnindexed();
				window.scene.add(pointsObs);
				this.reflPointsObsUnindexed = [pointsObs];
				this.updateObservedUnindexedReflections();
			}
			if (this.reflPointsObsIndexed) {
				const reflGeometryObs = new THREE.BufferGeometry();
				reflGeometryObs.setAttribute(
					"position", new THREE.Float32BufferAttribute(this.reflPositionsIndexed, 3)
				);

				const reflMaterialObs = new THREE.PointsMaterial({
					size: this.reflectionSize.value,
					transparent: true,
					color: ReciprocalLatticeViewer.colors()["reflectionObsIndexed"]
				});
				const pointsObs = new THREE.Points(reflGeometryObs, reflMaterialObs);
				this.clearReflPointsObsIndexed();
				window.scene.add(pointsObs);
				this.reflPointsObsIndexed = [pointsObs];
				this.updateObservedIndexedReflections();
			}
		}

		if (this.refl.containsXYZCal() && this.reflPositionsCal) {
			const reflGeometryCal = new THREE.BufferGeometry();
			reflGeometryCal.setAttribute(
				"position", new THREE.Float32BufferAttribute(this.reflPositionsCal, 3)
			);

			const reflMaterialCal = new THREE.PointsMaterial({
				size: this.reflectionSize.value,
				transparent: true,
				color: ReciprocalLatticeViewer.colors()["reflectionCal"]
			});
			const pointsCal = new THREE.Points(reflGeometryCal, reflMaterialCal);
			this.clearReflPointsCal();
			window.scene.add(pointsCal);
			this.reflPointsCal = [pointsCal];
			this.updateCalculatedReflections();
		}
		this.requestRender();
	}

	mapPointToGlobal(point, pOrigin, fa, sa, scaleFactor = [1, 1]) {
		const pos = pOrigin.clone();
		pos.add(fa.clone().normalize().multiplyScalar(point[0] * scaleFactor[0]));
		pos.add(sa.clone().normalize().multiplyScalar(point[1] * scaleFactor[1]));
		return pos;
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
		for (var i = 0; i < this.reciprocalCellMeshes.length; i++) {
			window.scene.remove(this.reciprocalCellMeshes[i]);
			this.reciprocalCellMeshes[i].geometry.dispose();
			this.reciprocalCellMeshes[i].material.dispose();
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
		this.updateReciprocalCell(false);
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
		this.showCloseExptButton();
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
			window.scene.remove(this.reflPointsObsIndexed[i]);
			this.reflPointsObsIndexed[i].geometry.dispose();
			this.reflPointsObsIndexed[i].material.dispose();
		}
		this.reflPointsObsIndexed = [];
	}

	clearReflPointsObsUnindexed() {
		for (var i = 0; i < this.reflPointsObsUnindexed.length; i++) {
			window.scene.remove(this.reflPointsObsUnindexed[i]);
			this.reflPointsObsUnindexed[i].geometry.dispose();
			this.reflPointsObsUnindexed[i].material.dispose();
		}
		this.reflPointsObsUnindexed = [];
	}

	clearReflPointsCal() {
		for (var i = 0; i < this.reflPointsCal.length; i++) {
			window.scene.remove(this.reflPointsCal[i]);
			this.reflPointsCal[i].geometry.dispose();
			this.reflPointsCal[i].material.dispose();
		}
		this.reflPointsCal = [];
	}

	clearReflectionTable() {
		this.clearReflPointsObsIndexed();
		this.clearReflPointsObsUnindexed();
		this.clearReflPointsCal();
		this.refl.clearReflectionTable();
		this.updateReflectionCheckboxStatus();
		this.setDefaultReflectionsDisplay();
		this.hideCloseReflButton();
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
		if (this.hasReflectionTable()) {
			this.showCloseReflButton();
		}
		this.requestRender();
	}

	addReflections() {

		function getRLP(s1, wavelength, unitS0, viewer, goniometer, angle) {
			const rlp = s1.clone().normalize().sub(unitS0.clone().normalize()).multiplyScalar(1 / wavelength);
			if (goniometer === null){
				return rlp.multiplyScalar(viewer.rlpScaleFactor);
			}
			const fixedRotation = goniometer["fixedRotation"];
			const settingRotation = goniometer["settingRotation"];
			const rotationAxis = goniometer["rotationAxis"];

			rlp.applyMatrix3(settingRotation.clone().invert());
			rlp.applyAxisAngle(rotationAxis, -angle);
			rlp.applyMatrix3(fixedRotation.clone().invert());
			return rlp.multiplyScalar(viewer.rlpScaleFactor);
		}

		if (!this.hasReflectionTable()) {
			console.warn("Tried to add reflections but no table has been loaded");
			return;
		}
		if (!this.hasExperiment()) {
			console.warn("Tried to add reflections but no experiment has been loaded");
			this.clearReflectionTable();
			return;
		}

		const positionsObsIndexed = new Array();
		const positionsObsUnindexed = new Array();
		const positionsCal = new Array();
		const containsXYZObs = this.refl.containsXYZObs();
		const containsXYZCal = this.refl.containsXYZCal();
		const containsMillerIndices = this.refl.containsMillerIndices();
		const containsWavelengths = this.refl.containsWavelengths();
		const containsWavelengthsCal = this.refl.containsWavelengthsCal();
		const containsAngleObs = this.refl.containsRotationAnglesObs();
		const containsAngleCal = this.refl.containsRotationAnglesCal();
		var wavelength = this.expt.getBeamData()["wavelength"];
		var wavelengthCal = this.expt.getBeamData()["wavelength"];
		var unitS0 = this.expt.getBeamDirection().multiplyScalar(-1).normalize();
		var goniometer = this.expt.goniometer;

		for (var i = 0; i < this.expt.getNumDetectorPanels(); i++) {

			const panelReflections = this.refl.getReflectionsForPanel(i);
			const panelData = this.expt.getPanelDataByIdx(i);

			const fa = panelData["fastAxis"];
			const sa = panelData["slowAxis"];
			const pOrigin = panelData["origin"];
			const pxSize = [panelData["pxSize"].x, panelData["pxSize"].y];

			for (var j = 0; j < panelReflections.length; j++) {

				if (containsXYZObs) {

					const xyzObs = panelReflections[j]["xyzObs"];

					if (containsWavelengths) {
						wavelength = panelReflections[j]["wavelength"];
					}
					if (!wavelength) {
						continue;
					}
					const s1 = this.mapPointToGlobal(xyzObs, pOrigin, fa, sa, pxSize);
					const angle = panelReflections[j]["angleObs"];
					const rlp = getRLP(s1, wavelength, unitS0, this, goniometer, angle);

					if (containsMillerIndices && panelReflections[j]["indexed"]) {
						positionsObsIndexed.push(rlp.x);
						positionsObsIndexed.push(rlp.y);
						positionsObsIndexed.push(rlp.z);
					}
					else {
						positionsObsUnindexed.push(rlp.x);
						positionsObsUnindexed.push(rlp.y);
						positionsObsUnindexed.push(rlp.z);
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
					const s1 = this.mapPointToGlobal(xyzCal, pOrigin, fa, sa, pxSize);
					const angle = panelReflections[j]["angleCal"];
					const rlp = getRLP(s1, wavelengthCal, unitS0, viewer, goniometer, angle);
					positionsCal.push(rlp.x);
					positionsCal.push(rlp.y);
					positionsCal.push(rlp.z);
				}
			}
		}

		if (containsXYZObs) {
			if (containsMillerIndices) {

				const reflGeometryObsIndexed = new THREE.BufferGeometry();
				reflGeometryObsIndexed.setAttribute(
					"position", new THREE.Float32BufferAttribute(positionsObsIndexed, 3)
				);

				const reflMaterialObsIndexed = new THREE.PointsMaterial({
					size: this.reflectionSize.value,
					transparent: true,
					color: ReciprocalLatticeViewer.colors()["reflectionObsIndexed"]
				});
				const pointsObsIndexed = new THREE.Points(reflGeometryObsIndexed, reflMaterialObsIndexed);
				window.scene.add(pointsObsIndexed);
				this.reflPointsObsIndexed = [pointsObsIndexed];
				this.reflPositionsIndexed = positionsObsIndexed;

			}
			const reflGeometryObsUnindexed = new THREE.BufferGeometry();
			reflGeometryObsUnindexed.setAttribute(
				"position", new THREE.Float32BufferAttribute(positionsObsUnindexed, 3)
			);

			const reflMaterialObsUnindexed = new THREE.PointsMaterial({
				size: this.reflectionSize.value,
				transparent: true,
				color: ReciprocalLatticeViewer.colors()["reflectionObsUnindexed"]
			});
			const pointsObsUnindexed = new THREE.Points(reflGeometryObsUnindexed, reflMaterialObsUnindexed);
			window.scene.add(pointsObsUnindexed);
			this.reflPointsObsUnindexed = [pointsObsUnindexed];
			this.reflPositionsUnindexed = positionsObsUnindexed;
		}

		if (containsXYZCal) {
			const reflGeometryCal = new THREE.BufferGeometry();
			reflGeometryCal.setAttribute(
				"position", new THREE.Float32BufferAttribute(positionsCal, 3)
			);

			const reflMaterialCal = new THREE.PointsMaterial({
				size: this.reflectionSize.value,
				transparent: true,
				color: ReciprocalLatticeViewer.colors()["reflectionCal"]
			});
			const pointsCal = new THREE.Points(reflGeometryCal, reflMaterialCal);
			window.scene.add(pointsCal);
			this.reflPointsCal = [pointsCal];
			this.reflPositionsCal = positionsCal;
		}

		this.updateReflectionCheckboxStatus();
		this.setDefaultReflectionsDisplay();
	}

	setDefaultReflectionsDisplay() {

		/**
		 * If both observed and calculated reflections are available,
		 * show observed by default.
		 */

		if (!this.hasReflectionTable()) {
			this.observedIndexedReflsCheckbox.checked = false;
			this.observedUnindexedReflsCheckbox.checked = false;
			this.calculatedReflsCheckbox.checked = false;
			return;
		}

		if (this.reflPointsObsIndexed.length > 0) {
			this.updateObservedIndexedReflections(true);
			this.observedIndexedReflsCheckbox.checked = true;
			this.updateCalculatedReflections(false);
			this.calculatedReflsCheckbox.checked = false;
		}
		if (this.reflPointsObsUnindexed.length > 0) {
			this.updateObservedUnindexedReflections(true);
			this.observedUnindexedReflsCheckbox.checked = true;
			this.updateCalculatedReflections(false);
			this.calculatedReflsCheckbox.checked = false;
		}
		else if (this.reflPointsCal.length > 0) {
			this.showCalculatedReflections(true);
			this.calculatedReflsCheckbox.checked = true;
			this.observedIndexedReflsCheckbox.checked = false;
			this.observedUnindexedReflsCheckbox.checked = false;
		}
	}

	updateReflectionCheckboxStatus() {
		if (!this.hasReflectionTable()) {
			this.observedIndexedReflsCheckbox.disabled = true;
			this.observedUnindexedReflsCheckbox.disabled = true;
			this.calculatedReflsCheckbox.disabled = true;
			return;
		}
		this.observedUnindexedReflsCheckbox.disabled = !this.refl.hasXYZObsData();
		this.observedIndexedReflsCheckbox.disabled = !this.refl.hasMillerIndicesData();
		this.reciprocalCellCheckbox.disabled = !this.refl.hasMillerIndicesData();
		this.calculatedReflsCheckbox.disabled = !this.expt.hasCrystal();
	}

	addBeam() {
		var beamLength = 800.;
		var bd = this.expt.getBeamDirection();;

		var incidentVertices = []
		incidentVertices.push(
			new THREE.Vector3(bd.x * -beamLength, bd.y * -beamLength, bd.z * -beamLength)
		);
		incidentVertices.push(
			new THREE.Vector3(bd.x * -beamLength * .5, bd.y * -beamLength * .5, bd.z * -beamLength * .5)
		);
		incidentVertices.push(new THREE.Vector3(0, 0, 0));
		const incidentLine = new MeshLine();
		incidentLine.setPoints(incidentVertices);
		const incidentMaterial = new MeshLineMaterial({
			lineWidth: 5,
			color: ReciprocalLatticeViewer.colors()["beam"],
			fog: true,
			transparent: true,
			opacity: 0.,
			depthWrite: false
		});
		const incidentMesh = new THREE.Mesh(incidentLine, incidentMaterial);
		incidentMesh.raycast = MeshLineRaycast;
		this.beamMeshes.push(incidentMesh);
		window.scene.add(incidentMesh);

		var outgoingVertices = []
		outgoingVertices.push(new THREE.Vector3(0, 0, 0));
		outgoingVertices.push(
			new THREE.Vector3(bd.x * beamLength * .5, bd.y * beamLength * .5, bd.z * beamLength * .5)
		);
		outgoingVertices.push(
			new THREE.Vector3(bd.x * beamLength, bd.y * beamLength, bd.z * beamLength)
		);
		const outgoingLine = new MeshLine();
		outgoingLine.setPoints(outgoingVertices);
		const outgoingMaterial = new MeshLineMaterial({
			lineWidth: 5,
			color: ReciprocalLatticeViewer.colors()["beam"],
			transparent: true,
			opacity: .25,
			fog: true,
			depthWrite: false
		});
		const outgoingMesh = new THREE.Mesh(outgoingLine, outgoingMaterial);
		outgoingMesh.raycast = MeshLineRaycast;
		this.beamMeshes.push(outgoingMesh);
		window.scene.add(outgoingMesh);
	}

	addSample() {
		const sphereGeometry = new THREE.SphereGeometry(5);
		const sphereMaterial = new THREE.MeshBasicMaterial({
			color: ReciprocalLatticeViewer.colors()["sample"],
			transparent: true,
			depthWrite: false
		});
		const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
		sphere.name = "sample";
		this.sampleMesh = sphere;
		window.scene.add(sphere);
	}

	addCrystalRLV() {

		function getAvgRLVLength(crystalRLV){
			const a = crystalRLV[0].length();
			const b = crystalRLV[1].length();
			const c = crystalRLV[2].length();
			return (a+b+c)/3.;
		}

		if (!this.expt.hasCrystal()) {
			return;
		}

		const crystalRLV = this.expt.getCrystalRLV();

		const avgRLVLength = getAvgRLVLength(crystalRLV);
		const minLineWidth = ReciprocalLatticeViewer.sizes()["minRLVLineWidth"];
		const maxLineWidth = ReciprocalLatticeViewer.sizes()["maxRLVLineWidth"];
		const lineWidth = Math.min(Math.max(avgRLVLength * 3, minLineWidth), maxLineWidth);

		const material = new MeshLineMaterial({
			lineWidth: lineWidth,
			color: ReciprocalLatticeViewer.colors()["reciprocalCell"],
			transparent: true,
			opacity: 0.5,
			depthWrite: false,
			sizeAttenuation: true
		});

		const a = crystalRLV[0].clone().multiplyScalar(100);
		const b = crystalRLV[1].clone().multiplyScalar(100);
		const c = crystalRLV[2].clone().multiplyScalar(100);
		const origin = new THREE.Vector3(0, 0, 0);

		const labelScaleFactor = Math.max(avgRLVLength, 1);
		this.addRLVLabel("a*", origin.clone().add(a).multiplyScalar(0.5), "white", labelScaleFactor);
		this.addRLVLabel("b*", origin.clone().add(b).multiplyScalar(0.5), "white", labelScaleFactor);
		this.addRLVLabel("c*", origin.clone().add(c).multiplyScalar(0.5), "white", labelScaleFactor);

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
		viewer.reciprocalCellMeshes.push(Mesh);
		window.scene.add(Mesh);
	}

	addAxes() {
		function addAxis(viewer, vertices, color) {
			const line = new MeshLine();
			line.setPoints(vertices);
			const Material = new MeshLineMaterial({
				lineWidth: 5,
				color: color,
				fog: true,
				transparent: true,
				opacity: 0.5,
				depthWrite: false
			});
			const Mesh = new THREE.Mesh(line, Material);
			viewer.axesMeshes.push(Mesh);
			window.scene.add(Mesh);
		}

		const length = 200.;
		this.axesMeshes = [];

		const xVertices = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(length, 0, 0)];
		const yVertices = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, length, 0)];
		const zVertices = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, length)];

		addAxis(this, xVertices, ReciprocalLatticeViewer.colors()["axes"][0]);
		addAxis(this, yVertices, ReciprocalLatticeViewer.colors()["axes"][1]);
		addAxis(this, zVertices, ReciprocalLatticeViewer.colors()["axes"][2]);
		this.axesCheckbox.disabled = false;
	}

	addRLVLabel(text, pos, color, scaleFactor){
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

		this.reciprocalCellMeshes.push(sprite);
		window.scene.add(sprite);
		this.requestRender();

	}

	setCameraSmooth(position) {
		this.rotateToPos(position);
		window.controls.update();
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

	displayFooterText(text) {
		this.showFooterText();
		this.footerText.textContent = text;
	}

	hideFooterText() {
		this.footerText.style.display = "none";
	}

	showFooterText() {
		this.footerText.style.display = "block";
	}

	displayDefaultHeaderText() {
		if (this.hasExperiment()) {
			this.hideHeaderText();
		}
		else {
			this.displayHeaderText(ReciprocalLatticeViewer.text()["default"]);
		}
	}

	displayImageFilenames() {
		this.displayHeaderText(this.expt.imageFilenames);
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
		obj.material.color = new THREE.Color(ReciprocalLatticeViewer.colors()["highlight"]);
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


	updateGUIInfo() {

		function updateReflectionInfo(viewer) {
			const intersects = window.rayCaster.intersectObjects(viewer.reflPointsObsIndexed);
			window.rayCaster.setFromCamera(window.mousePosition, window.camera);
			if (intersects.length > 0) {
				for (var i = 0; i < intersects.length; i++) {
					const millerIdx = viewer.refl.getMillerIndexById(intersects[i].index);
					viewer.displayHeaderText(" (" + millerIdx + ")");
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
				const text = "<b>beam: </b>" + viewer.expt.getBeamSummary();
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

	updateOriginObjectsOpacity() {
		if (!this.hasExperiment()) {
			return;
		}
		const minCameraDistance = 55000;
		const maxCameraDistance = 1000000;
		const cameraPos = window.camera.position;
		const cameraDistance = Math.pow(cameraPos.x, 2) + Math.pow(cameraPos.y, 2) + Math.pow(cameraPos.z, 2);
		var opacity = ((cameraDistance - minCameraDistance) / (maxCameraDistance - minCameraDistance));
		opacity = Math.min(1., Math.max(opacity, 0.))
		this.beamMeshes[0].material.opacity = opacity;
		this.beamMeshes[1].material.opacity = opacity * .25;
		this.sampleMesh.material.opacity = opacity;
		for (var i = 0; i < this.axesMeshes.length; i++) {
			this.axesMeshes[i].material.opacity = opacity * .5;
		}
	}

	rotateToPos(pos) {
		gsap.to(window.camera.position, {
			duration: 1,
			x: -pos.x,
			y: -pos.y,
			z: -pos.z,
			onUpdate: function () {
				window.camera.lookAt(pos);
				window.viewer.requestRender();
			}
		});
	}

	zoomInOnReflection(reflection, fitOffset = 1.1) {

		const size = new THREE.Vector3();
		const center = new THREE.Vector3();
		const box = new THREE.Box3();

		box.makeEmpty();
		box.expandByObject(reflection);

		box.getSize(size);
		box.getCenter(center);

		const maxSize = Math.max(size.x, size.y, size.z);
		const fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * window.camera.fov / 360));
		const fitWidthDistance = fitHeightDistance / window.camera.aspect;
		const distance = fitOffset * Math.max(fitHeightDistance, fitWidthDistance);

		const direction = center.clone()
			.normalize()
			.multiplyScalar(distance);

		const target = center.clone().sub(direction);
		gsap.to(window.camera.position, {
			duration: 1,
			x: target.x,
			y: target.y,
			z: target.z,
			onUpdate: function () {
				window.camera.lookAt(target);
				window.viewer.requestRender();
			}
		});
		window.controls.update();
	}

	animate() {
		if (!this.renderRequested) {
			return;
		}
		window.viewer.updateOriginObjectsOpacity();
		window.viewer.updateGUIInfo();
		window.controls.update();
		window.renderer.render(window.scene, window.camera);
		this.renderRequested = false;
	}

	requestRender() {
		if (typeof window !== "undefined" && !this.renderRequested) {
			this.renderRequested = true;
			window.requestAnimationFrame(this.animate.bind(this));
		}
	}

}

function setupScene() {

	/**
	 * Sets the renderer, camera, controls
	 */


	if (typeof window.viewer === "undefined") { return; }

	// Renderer
	window.renderer = new THREE.WebGLRenderer();
	window.renderer.setClearColor(ReciprocalLatticeViewer.colors()["background"]);
	window.renderer.setSize(window.innerWidth, window.innerHeight);
	document.body.appendChild(window.renderer.domElement);

	// Two elements used to write text to the screen
	headerText = window.document.getElementById("headerText")
	sidebar = window.document.getElementById("sidebar")

	window.scene = new THREE.Scene()
	window.scene.fog = new THREE.Fog(ReciprocalLatticeViewer.colors()["background"], 500, 8000);
	window.camera = new THREE.PerspectiveCamera(
		45,
		window.innerWidth / window.innerHeight,
		100,
		10000
	);
	window.renderer.render(window.scene, window.camera);
	window.rayCaster = new THREE.Raycaster(); // used for all raycasting

	// Controls
	window.controls = new OrbitControls(window.camera, window.renderer.domElement);
	window.controls.maxDistance = 3000;
	window.controls.enablePan = false;
	window.controls.rotateSpeed = 0.2;
	window.controls.update();
	window.controls.addEventListener("change", function () { window.viewer.requestRender(); });

	// Events
	window.mousePosition = new THREE.Vector2();
	window.addEventListener("mousemove", function (e) {
		window.mousePosition.x = (e.clientX / window.innerWidth) * 2 - 1;
		window.mousePosition.y = - (e.clientY / window.innerHeight) * 2 + 1;
		window.viewer.requestRender();
	});

	window.addEventListener("resize", function () {
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

	window.addEventListener('drop', function (event) {

		event.preventDefault();
		event.stopPropagation();
		const file = event.dataTransfer.files[0];
		const fileExt = file.name.split(".").pop();
		if (fileExt == "refl") {
			window.viewer.addReflectionTable(file);
		}
		else if (fileExt == "expt") {
			window.viewer.addExperiment(file);
		}
	});

	window.addEventListener('dblclick', function (event) {
	});

	window.addEventListener('mousedown', function (event) {
		if (event.button == 2) {
			window.viewer.rotateToPos(ReciprocalLatticeViewer.cameraPositions()["defaultWithExperiment"]);
		}
	});
	window.addEventListener('keydown', function (event) {
		if (event.key === "s") {
			window.viewer.toggleSidebar();
		}
	});
	window.viewer.addAxes();
	window.viewer.updateAxes(false);
	window.viewer.updateReciprocalCell(false);
	window.viewer.setCameraToDefaultPosition();
	window.viewer.requestRender();
}

window.viewer = new ReciprocalLatticeViewer(new ExptParser(), new ReflParser());
setupScene();