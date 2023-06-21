import * as THREE from 'three';

export class ExptParser{

	constructor(){
		this.exptJSON = null;
		this.nameIdxMap = {};
		this.panelCentroids = {};
		this.filename = null;
		this.imageFilenames = null;
		this.crystalSummary = null;
		this.goniometer = null;
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
		this.nameIdxMap = {};
		this.panelCentroids = {};
		this.filename = null;
		this.imageFilenames = null;
		this.crystalSummary = null;
	}

	parseExperiment = (file) => {
		const reader = new FileReader();

		return new Promise((resolve, reject) => {
			reader.onerror = () => {
				reader.abort();
				reject(new DOMException("Problem parsing input file."));
			};

			reader.onloadend = () => {
				resolve(reader.result);
				if (ExptParser.isDIALSExpt(file, reader.result)){
					this.exptJSON = JSON.parse(reader.result);
					this.loadPanelData();
					this.loadCrystalSummary();
					this.loadGoniometer();
					this.filename = file.name;
					this.imageFilenames = this.getImageFilenames();
				}
			};
			reader.readAsText(file);    
		});
	};

	getImageFilenames(){
		return this.exptJSON["imageset"][0]["template"];
	}

	loadPanelData(){
		for (var i = 0; i < this.getNumDetectorPanels(); i++){
			const data = this.getPanelDataByIdx(i);
			const name = this.getDetectorPanelName(i);
			this.nameIdxMap[name] = i;
			const centroid = data["origin"];
			centroid.add(data["fastAxis"].multiplyScalar(.5));
			centroid.add(data["slowAxis"].multiplyScalar(.5));
			this.panelCentroids[name] = centroid;
		}
	}

	getPanelCentroid(name){
		return this.panelCentroids[name];
	}

	getDetectorPanelData(){
		return this.exptJSON["detector"][0]["panels"];
	}

	getBeamData(){
		return this.exptJSON["beam"][0];
	}

	getBeamSummary(){
		const beamData = this.getBeamData();
		const direction = beamData["direction"];
		const wavelength = beamData["wavelength"];
		var text = "direction: (" + direction + "), ";
		if (wavelength){
			text += " wavelength: " + wavelength;
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
					fr[6], fr[7], fr[i]
				),
				"settingRotation": new THREE.Matrix3(
					sr[0], sr[1], sr[2],
					sr[3], sr[4], sr[5],
					sr[6], sr[7], sr[i]
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

			const fixedRotation = new THREE.Matrix3(
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
				fixedRotation.multiply(R);
			}
			for (var i = scanAxis + 1; i < axes.length; i++){
				const R = axisAngleToMatrix(axes[i], angles[i]);
				settingRotation.multiply(R);
			}

			return {
				"fixedRotation" : fixedRotation.clone().multiply(fixedRotation),
				"settingRotation" : settingRotation.clone().multiply(settingRotation),
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
		return this.exptJSON["crystal"].length > 0;
	}

	getCrystalRLV(){
		const crystalData = this.getCrystalData();
		var a = crystalData["real_space_a"];
		a = new THREE.Vector3(a[0], a[1], a[2]);
		var b = crystalData["real_space_b"];
		b = new THREE.Vector3(b[0], b[1], b[2]);
		var c = crystalData["real_space_c"];
		c = new THREE.Vector3(c[0], c[1], c[2]);

		const pi = Math.PI;

		const bxc = b.clone().cross(c);
		const adot_bxc = 1/(a.clone().dot(bxc));
		const aStar = bxc.clone().multiplyScalar(adot_bxc * 2 * pi); 

		const cxa = c.clone().cross(a);
		const bStar = cxa.clone().multiplyScalar(adot_bxc * 2 * pi); 

		const axb = a.clone().cross(b);
		const cStar = axb.clone().multiplyScalar(adot_bxc * 2 * pi);
		return [aStar, bStar, cStar];
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

	getPanelDataByName(name){
		const idx = this.nameIdxMap[name];
		const data = this.getPanelDataByIdx(idx);
		return data;
	}

	getPanelDataByIdx(idx){

		/**
		 * Returns dictionary of panel data in mm
		 */

		const panelData = this.getDetectorPanelData()[idx];
		var pxSize = new THREE.Vector2(panelData["pixel_size"][0], panelData["pixel_size"][1]);
		var pxs = new THREE.Vector2(panelData["image_size"][0], panelData["image_size"][1]);
		var panelSize = new THREE.Vector2(pxSize.x*pxs.x, pxSize.y*pxs.y);
		var fa = new THREE.Vector3(panelData["fast_axis"][0], panelData["fast_axis"][1], panelData["fast_axis"][2]).multiplyScalar(panelSize.x);
		var sa = new THREE.Vector3(panelData["slow_axis"][0], panelData["slow_axis"][1], panelData["slow_axis"][2]).multiplyScalar(panelSize.y);
		var o = new THREE.Vector3(panelData["origin"][0], panelData["origin"][1], panelData["origin"][2]);
		return {
			"panelSize" : panelSize,
			"pxSize" : pxSize,
			"pxs" : pxs,
			"fastAxis" : fa,
			"slowAxis" : sa,
			"origin" : o
		}

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
		return this.getDetectorPanelData().length;
	}

	getDetectorPanelName(idx){
		return this.getDetectorPanelData()[idx]["name"];
	}

	getDetectorPanelCorners(idx){

		const vecs = this.getPanelDataByIdx(idx);

		// Corners
		var c1 = vecs["origin"].clone();
		var c2 = vecs["origin"].clone().add(vecs["fastAxis"]);
		var c3 = vecs["origin"].clone().add(vecs["fastAxis"]).add(vecs["slowAxis"]);
		var c4 = vecs["origin"].clone().add(vecs["slowAxis"]);
		return [c1, c2, c3, c4];
	}

	getDetectorPanelNormal(idx){
		const vecs = this.getPanelDataByIdx(idx);
		return vecs["fastAxis"].cross(vecs["slowAxis"]).normalize();

	}



}