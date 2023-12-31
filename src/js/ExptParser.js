import * as THREE from 'three';

export class ExptParser{

	/*
	 * Class for reading DIALS Experiment list files (.expt)
	 * https://dials.github.io/documentation/data_files.html
	 */

	constructor(){
		this.exptJSON = null;
		this.filename = null;
		this.imageFilenames = null;
		this.crystalSummary = null;
		this.goniometer = null;
		this.crystal = null;
		this.scan = null;
		this.detectorPanelData = [];
	}

	hasExptJSON(){
		return this.exptJSON != null;
	}

	static isDIALSExpt(file, content){
		const fileExt = file.name.split(".").pop() ;
		if (fileExt === "expt" && content[0] === "{"){
			return true;
		}
		return false;
	}

	clearExperiment(){
		this.exptJSON = null;
		this.filename = null;
		this.imageFilenames = null;
		this.crystalSummary = null;
		this.goniometer = null;
		this.crystal = null;
		this.scan = null;
		this.detectorPanelData = [];
	}

	parseExperiment = (file) => {
		const reader = new FileReader();

		return new Promise((resolve, reject) => {
			reader.onerror = () => {
				reader.abort();
				reject(new DOMException("Problem parsing .expt file."));
			};

			reader.onloadend = () => {
				resolve(reader.result);
				if (ExptParser.isDIALSExpt(file, reader.result)){
					this.exptJSON = JSON.parse(reader.result);
					this.loadDetectorPanelData();
					this.loadCrystalSummary();
					this.loadGoniometer();
					this.loadCrystal();
					this.loadScan();
					this.filename = file.name;
					this.imageFilenames = this.getImageFilenames();
				}
			};
			reader.readAsText(file);    
		});
	};

	parseExperimentJSON(jsonString){
		this.exptJSON = jsonString 
		this.loadDetectorPanelData();
		this.loadCrystalSummary();
		this.loadGoniometer();
		this.loadCrystal();
		this.loadScan();
		this.imageFilenames = this.getImageFilenames();
	}

	getImageFilenames(){
		return this.exptJSON["imageset"][0]["template"];
	}

	loadDetectorPanelData(){

		const rawDetectorPanelData = this.getRawDetectorPanelData();
		var detectorData = this.getDetectorOrientationData();
		this.detectorPanelData = [];

		for (var i = 0; i < rawDetectorPanelData.length; i++){

			const panelData = rawDetectorPanelData[i];

			var pxSize = new THREE.Vector2(panelData["pixel_size"][0], panelData["pixel_size"][1]);
			var pxs = new THREE.Vector2(panelData["image_size"][0], panelData["image_size"][1]);
			var panelSize = new THREE.Vector2(pxSize.x*pxs.x, pxSize.y*pxs.y);
			var fa = new THREE.Vector3(panelData["fast_axis"][0], panelData["fast_axis"][1], panelData["fast_axis"][2]);
			var sa = new THREE.Vector3(panelData["slow_axis"][0], panelData["slow_axis"][1], panelData["slow_axis"][2]);
			var o = new THREE.Vector3(panelData["origin"][0], panelData["origin"][1], panelData["origin"][2]);

			var localDMatrix = new THREE.Matrix3(
				fa.x, sa.x, o.x,
				fa.y, sa.y, o.y,
				fa.z, sa.z, o.z
			);

			var detectorFa = new THREE.Vector3(
				detectorData["fast_axis"][0],
				detectorData["fast_axis"][1],
				detectorData["fast_axis"][2],
			);
			var detectorSa = new THREE.Vector3(
				detectorData["slow_axis"][0],
				detectorData["slow_axis"][1],
				detectorData["slow_axis"][2],
			);
			var detectorNormal = detectorFa.clone().cross(detectorSa);

			var parentOrientation = new THREE.Matrix3(
				detectorFa.x, detectorSa.x, detectorNormal.x,
				detectorFa.y, detectorSa.y, detectorNormal.y,
				detectorFa.z, detectorSa.z, detectorNormal.z
			);

			var parentOrigin = new THREE.Vector3(
				detectorData["origin"][0],
				detectorData["origin"][1],
				detectorData["origin"][2],
			)


			var dMatrixOffset = parentOrientation.clone().multiply(localDMatrix);
			var elems = dMatrixOffset.elements;
			elems[6] += parentOrigin.x;
			elems[7] += parentOrigin.y;
			elems[8] += parentOrigin.z;
			var dMatrix = new THREE.Matrix3().fromArray(
				elems
			)

			fa.multiplyScalar(panelSize.x);
			sa.multiplyScalar(panelSize.y);

			this.detectorPanelData.push({
				"panelSize" : panelSize,
				"pxSize" : pxSize,
				"pxs" : pxs,
				"fastAxis" : fa,
				"slowAxis" : sa,
				"origin" : o,
				"dMatrix" : dMatrix
			});

		}

	}

	getRawDetectorPanelData(){
		return this.exptJSON["detector"][0]["panels"];
	}

	getBeamData(){
		return this.exptJSON["beam"][0];
	}

	getBeamSummary(){
		const beamData = this.getBeamData();
		var direction = beamData["direction"];
		direction = [direction[0].toFixed(3), direction[1].toFixed(3), direction[2].toFixed(3)];
		const wavelength = beamData["wavelength"];
		var text = "direction: (" + direction + "), ";
		if (wavelength){
			text += " wavelength: " + wavelength.toFixed(3);
		}
		return text;
	}

	loadGoniometer(){

		function isMultiAxesGoniometer(goniometerData){
			const requiredFields = ["axes", "angles", "scan_axis"];
			for (var i = 0; i < requiredFields.length; i++){
				if (!(requiredFields[i] in goniometerData)){
					return false;
				}
			}
			return true;
		}

		function loadBasicGoniometer(goniometerData){
			const fr = goniometerData["fixed_rotation"];
			const sr = goniometerData["setting_rotation"];
			const ra = goniometerData["rotation_axis"];
			return  {
				"fixedRotation" : new THREE.Matrix3(
					fr[0], fr[1], fr[2],
					fr[3], fr[4], fr[5],
					fr[6], fr[7], fr[8]
				),
				"settingRotation": new THREE.Matrix3(
					sr[0], sr[1], sr[2],
					sr[3], sr[4], sr[5],
					sr[6], sr[7], sr[8]
				),
				"rotationAxis" : new THREE.Vector3(
					ra[0], ra[1], ra[2]
				)
			}
		}

		function loadMultiAxesGoniometer(goniometerData){

			function axisAngleToMatrix(axis, angle) {

				const axisNormalized = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();

				const c = Math.cos(angle * Math.PI/180.);
				const s = Math.sin(angle * Math.PI/180.);

				const [x, y, z] = axisNormalized.toArray();

				const m11 = c + (1 - c) * x * x;
				const m12 = ((1 - c) * x * y) - (s * z);
				const m13 = ((1 - c) * x * z) + (s * y);

				const m21 = ((1 - c) * x * y) + (s * z);
				const m22 = c + ((1 - c) * y * y);
				const m23 = ((1 - c) * y * z) - (s * x);

				const m31 = ((1 - c) * x * z) - (s * y);
				const m32 = ((1 - c) * y * z) + (s * x);
				const m33 = c + (1 - c) * z * z;

				return new THREE.Matrix3().set(
					m11, m12, m13,
					m21, m22, m23,
					m31, m32, m33
				).transpose();
			}

			const axes = goniometerData["axes"];
			const angles = goniometerData["angles"];
			const scanAxis = goniometerData["scan_axis"];

			const rotationAxisRaw = axes[scanAxis];
			const rotationAxis = new THREE.Vector3(
				rotationAxisRaw[0],
				rotationAxisRaw[1],
				rotationAxisRaw[2]
			);

			var fixedRotation = new THREE.Matrix3(
				1.0, 0.0, 0.0,
				0.0, 1.0, 0.0,
				0.0, 0.0, 1.0
			);

			const settingRotation = new THREE.Matrix3(
				1.0, 0.0, 0.0,
				0.0, 1.0, 0.0,
				0.0, 0.0, 1.0
			);

			for (var i = 0; i < scanAxis; i++){
				const R = axisAngleToMatrix(axes[i], angles[i]);
				fixedRotation = fixedRotation.clone().multiply(R);
			}
			for (var i = scanAxis + 1; i < axes.length; i++){
				const R = axisAngleToMatrix(axes[i], angles[i]);
				settingRotation.multiply(R);
			}

			return {
				"fixedRotation" : fixedRotation,
				"settingRotation" : settingRotation,
				"rotationAxis" : rotationAxis
			};

		}

		const goniometerList = this.exptJSON["goniometer"];
		if (!goniometerList || goniometerList.length === 0){
			this.goniometer = null;
			return;
		}
		const goniometerData = goniometerList[0];
		if (isMultiAxesGoniometer(goniometerData)){
			this.goniometer = loadMultiAxesGoniometer(goniometerData);
			return;
		}
		this.goniometer = loadBasicGoniometer(goniometerData);
	}

	getCrystalData(){
		return this.exptJSON["crystal"][0];
	}

	hasCrystal(){
		if (this.exptJSON === null){
			return false;
		}
		return this.crystal !== null;
	}

	loadCrystal(){

		function latticeParameters(a, b, c) {
			const aLength = a.length();
			const bLength = b.length();
			const cLength = c.length();
			const alpha = Math.acos(b.dot(c) / (bLength * cLength));
			const beta = Math.acos(a.dot(c) / (aLength * cLength));
			const gamma = Math.acos(a.dot(b) / (aLength * bLength));
			return [aLength, bLength, cLength, alpha, beta, gamma];
		}

		function unitCellVolume(a, b, c, alpha, beta, gamma) {

			const cosAlphaSq = Math.cos(alpha) ** 2;
			const cosBetaSq = Math.cos(beta) ** 2;
			const cosGammaSq = Math.cos(gamma) ** 2;
			const cosAlpha = Math.cos(alpha);
			const cosBeta = Math.cos(beta);
			const cosGamma = Math.cos(gamma);

			const volume =
				a * b * c *
				Math.sqrt(
				1 -
					cosAlphaSq -
					cosBetaSq -
					cosGammaSq +
					2 * cosAlpha * cosBeta * cosGamma
				);

			return volume;
		}

		function reciprocalLatticeConstants(a, b, c, alpha, beta, gamma, V){
			const rlcs = new Array(6);
			rlcs[0] = b * c * Math.sin(alpha) / V;
			rlcs[1] = c * a * Math.sin(beta) / V;
			rlcs[2] = a * b * Math.sin(gamma) / V;

			rlcs[3] = Math.cos(beta) * Math.cos(gamma) - Math.cos(alpha);
			rlcs[3] /= Math.sin(beta) * Math.sin(gamma);

			rlcs[4] = Math.cos(gamma) * Math.cos(alpha) - Math.cos(beta);
			rlcs[4] /= Math.sin(gamma) * Math.sin(alpha);

			rlcs[5] = Math.cos(alpha) * Math.cos(beta) - Math.cos(gamma);
			rlcs[5] /= Math.sin(alpha) * Math.sin(beta);

			return rlcs;
		}

		function getBMatrix(aVec, bVec, cVec){
			const [a, b, c, alpha, beta, gamma] = latticeParameters(aVec, bVec, cVec);
			const V = unitCellVolume(a, b, c, alpha, beta, gamma);
			const rlcs = reciprocalLatticeConstants(a, b, c, alpha, beta, gamma, V);
			const rAlpha = Math.sqrt(1 - rlcs[3] * rlcs[3]);

			const fcs = new Array(9);

			fcs[0] = 1./a;
			fcs[1] = -Math.cos(gamma) / (Math.sin(gamma) * a);

			fcs[2] = -(
				Math.cos(gamma) * Math.sin(beta) * rlcs[3] + Math.cos(beta) * Math.sin(gamma)
				);
			fcs[2] /= Math.sin(beta) * rAlpha * Math.sin(gamma) * a;

			fcs[3] = 0.;
			fcs[4] = 1. / (Math.sin(gamma) * b);
			fcs[5] = rlcs[3] / (rAlpha * Math.sin(gamma) * b);
			fcs[6] = 0.;
			fcs[7] = 0.;
			fcs[8] = 1. / (Math.sin(beta) * rAlpha * c);

			return new THREE.Matrix3(
				fcs[0], fcs[1], fcs[2],
				fcs[3], fcs[4], fcs[5],
				fcs[6], fcs[7], fcs[8],
			);
		}

		const crystalData = this.getCrystalData();
		if (!crystalData){
			this.crystalSummary = null;
			return;
		}
		var a = crystalData["real_space_a"];
		a = new THREE.Vector3(a[0], a[1], a[2]);
		var b = crystalData["real_space_b"];
		b = new THREE.Vector3(b[0], b[1], b[2]);
		var c = crystalData["real_space_c"];
		c = new THREE.Vector3(c[0], c[1], c[2]);

		const B = getBMatrix(a.clone(), b.clone(), c.clone());

		const UB = new THREE.Matrix3(
			a.x, a.y, a.z,
			b.x, b.y, b.z,
			c.x, c.y, c.z,
		).invert();


		const UBArr = UB.elements;
		UB.transpose();
		const U = new THREE.Matrix3();
		U.multiplyMatrices(B.clone().invert(), UB.clone());

		const reciprocalCell =  [
			new THREE.Vector3(UBArr[0], UBArr[3], UBArr[6]),
			new THREE.Vector3(UBArr[1], UBArr[4], UBArr[7]),
			new THREE.Vector3(UBArr[2], UBArr[5], UBArr[8]),
		]

		this.crystal = {
			"U" : U,
			"B" : B,
			"UB": UB,
			"reciprocalCell": reciprocalCell
		}
	}

	getCrystalRLV(){
		return this.crystal["reciprocalCell"];
	}

	getCrystalU(){
		return this.crystal["U"];
	}

	loadCrystalSummary(){
		const crystalData = this.getCrystalData();
		if (!crystalData){
			this.crystalSummary = null;
			return;
		}
		const aRaw = crystalData["real_space_a"];
		const aVec = new THREE.Vector3(aRaw[0], aRaw[1], aRaw[2]);
		const bRaw = crystalData["real_space_b"];
		const bVec = new THREE.Vector3(bRaw[0], bRaw[1], bRaw[2]);
		const cRaw = crystalData["real_space_c"];
		const cVec = new THREE.Vector3(cRaw[0], cRaw[1], cRaw[2]);

		const a = aVec.length().toFixed(3);
		const b = bVec.length().toFixed(3);
		const c = cVec.length().toFixed(3);

		const alpha = (bVec.angleTo(cVec) * (180./Math.PI)).toFixed(3);
		const beta = (aVec.angleTo(cVec) * (180./Math.PI)).toFixed(3);
		const gamma = (aVec.angleTo(bVec) * (180./Math.PI)).toFixed(3);

		var text = "a: " + a + " b: " + b + " c: " + c;
		text += " alpha: " + alpha + " beta: " + beta + " gamma: " + gamma;
		text += " (" + crystalData["space_group_hall_symbol"] + ")";
		this.crystalSummary = text;
	}

	getCrystalSummary(){
		return this.crystalSummary;
	}

	getDetectorOrientationData(){
		return this.exptJSON["detector"][0]["hierarchy"]
	}

	getDetectorPanelDataByIdx(idx){
		return this.detectorPanelData[idx];
	}

	getBeamDirection(){
		const beamData = this.getBeamData();
		return new THREE.Vector3(
			beamData["direction"][0], 
			beamData["direction"][1], 
			beamData["direction"][2]
		);
	}

	getNumDetectorPanels(){
		return this.detectorPanelData.length;
	}

	getScanData(){
		if (!("scan" in this.exptJSON)){
			return null;
		}
		return this.exptJSON["scan"][0];
	}

	loadScan(){
		const scanData = this.getScanData();
		if (!scanData){
			this.scan = null;
			return;
		}

		const osc = new THREE.Vector2(
			scanData["oscillation"][0] * Math.PI/180.,
			scanData["oscillation"][1] * Math.PI/180.
		);

		const ir = new THREE.Vector2(
			scanData["image_range"][0] - 1,
			scanData["image_range"][1] - 1
		);

		this.scan = {
			"oscillation" : osc,
			"imageRange" : ir
		};
	}

	getAngleFromFrame(frame){
		if (this.scan === null){
			return null;
		}
		const osc = this.scan["oscillation"];
		const ir = this.scan["imageRange"];
		return osc.x + ((frame - ir.x) * osc.y)
	}

	addAnglesToReflections(reflections){
		for (var i = 0; i < reflections.length; i++){
			if ("xyzObs" in reflections[i]){
				const angleObs = this.getAngleFromFrame(
					reflections[i]["xyzObs"][2]
				);
				reflections[i]["angleObs"] = angleObs;

			}
			if ("xyzCal" in reflections[i]){
				const angleCal = this.getAngleFromFrame(
					reflections[i]["xyzCal"][2]
				);
				reflections[i]["angleCal"] = angleCal;
			}
		}
		return reflections;
	}
}
