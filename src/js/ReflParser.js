import { deserialize } from "@ygoe/msgpack";

export class ReflParser{

	/*
	 * Class for reading DIALS reflection table files (.refl)
	 * https://dials.github.io/documentation/data_files.html
	 */

	constructor(){
		this.reflTable = null; // Raw msgpack table
		this.reflData = {}; // Parsed data mapped to each detector panel
		this.indexedMap = {}; // indexed refl number mapped to miller index
		this.filename = null;
		this.numReflections = null
	}

	hasReflTable(){
		return (this.reflTable != null);
	}

	clearReflectionTable(){
		this.reflTable = null;
		this.reflData = {};
		this.filename = null;
		this.numReflections = null;
	}

	hasXYZObsData(){

		// px, py, frame

		if (!this.hasReflTable()){
			return false;
		}
		for (var i in this.reflData){
			if (!("xyzObs" in this.reflData[i][0])){
				return false;
			}
		}
		return true;
	}

	hasXYZCalData(){

		// px, py, frame

		if (!this.hasReflTable()){
			return false;
		}
		for (var i in this.reflData){
			if (!("xyzCal" in this.reflData[i][0])){
				return false;
			}
		}
		return true;
	}

	hasMillerIndicesData(){
		if (!this.hasReflTable()){
			return false;
		}
		for (var i in this.reflData){
			if (!("millerIdx" in this.reflData[i][0])){
				return false;
			}
		}
		return true;
	}

	parseReflectionTable = (file) => {
		const reader = new FileReader();

		return new Promise((resolve, reject) => {
			reader.onerror = () => {
				reader.abort();
				reject(new DOMException("Problem parsing input file."));
			};

			reader.onloadend = () => {
				resolve(reader.result);
				const decoded = deserialize(new Uint8Array(reader.result));
				this.reflTable = decoded[2]["data"];
				this.loadReflectionData();
			};
			reader.readAsArrayBuffer(file);    
			this.filename = file.name;
		});
	};

	containsColumn(column_name){
		return (column_name in this.reflTable);
	}

	getColumnBuffer(column_name){
		return this.reflTable[column_name][1][1];
	}

	getUint32Array(column_name) {
		const buffer = this.getColumnBuffer(column_name);
		const dataView = new DataView(buffer.buffer);
		const arr = new Uint32Array(buffer.byteLength / 8);
		let count = 0;
		
		for (let i = 0; i < buffer.byteLength; i += 8) {
			arr[count] = dataView.getUint32(buffer.byteOffset + i, true); 
			count++;
		}
		return arr;
	}

	getDoubleArray(column_name){
		const buffer = this.getColumnBuffer(column_name);
		const dataView = new DataView(buffer.buffer);
		const arr = new Float64Array(buffer.length/8);
		let count = 0;
		for (let i = 0; i < buffer.byteLength; i+=8) {
		arr[count] = dataView.getFloat64(buffer.byteOffset + i, true);
		count++;
		}
		return arr;
	};

	getVec3DoubleArray(column_name){
		const buffer = this.getColumnBuffer(column_name);
		const dataView = new DataView(buffer.buffer);
		const arr = new Array(buffer.length/(8*3));
		let count = 0;
		for (let i = 0; i < buffer.byteLength; i+=24){
			const vec = new Float64Array(3);
			vec[0] = dataView.getFloat64(buffer.byteOffset + i, true);
			vec[1] = dataView.getFloat64(buffer.byteOffset + i+8, true);
			vec[2] = dataView.getFloat64(buffer.byteOffset + i+16, true);
			arr[count] = vec;
			count++;
		}
		return arr;
	}

	getVec3Int32Array(column_name){
		const buffer = this.getColumnBuffer(column_name);
		const arr = new Array(buffer.length/(3*4));
		const dataView = new DataView(buffer.buffer);
		let count = 0;
		for (let i = 0; i < buffer.length; i+=12){
			const vec = new Int32Array(3);
			vec[0] = dataView.getInt32(buffer.byteOffset + i, true);
			vec[1] = dataView.getInt32(buffer.byteOffset + i+4, true);
			vec[2] = dataView.getInt32(buffer.byteOffset + i+8, true);
			arr[count] = vec;
			count++;
		}
		return arr;
	}

	getPanelNumbers(){
		return this.getUint32Array("panel");
	}

	getXYZObs(){
		return this.getVec3DoubleArray("xyzobs.px.value");
	}

	containsXYZObs(){
		return this.containsColumn("xyzobs.px.value");
	}

	containsRotationAnglesObs(){
		return this.containsColumn("xyzobs.mm.value");
	}

	getRotationAnglesObs(){
		const column = this.getVec3DoubleArray("xyzobs.mm.value");
		const angles = [];
		for (var i = 0; i < column.length; i++){
			angles.push(column[i][2]);
		}
		return angles;
	}

	containsRotationAnglesCal(){
		return this.containsColumn("xyzcal.mm");
	}

	getRotationAnglesCal(){
		const column = this.getVec3DoubleArray("xyzcal.mm");
		const angles = [];
		for (var i = 0; i < column.length; i++){
			angles.push(column[i][2]);
		}
		return angles;
	}

	getXYZCal(){
		return this.getVec3DoubleArray("xyzcal.px");
	}

	containsXYZCal(){
		return this.containsColumn("xyzcal.px");
	}

	containsMillerIndices(){
		return this.containsColumn("miller_index");
	}

	getMillerIndices(){
		return this.getVec3Int32Array("miller_index");
	}

	isValidMillerIndex(idx){
		return Math.pow(idx[0], 2) + Math.pow(idx[1], 2) + Math.pow(idx[2], 2) > 1e-3;
	}

	containsWavelengths(){
		return this.containsColumn("wavelength");
	}

	getWavelengths(){
		return this.getDoubleArray("wavelength");
	}

	containsWavelengthsCal(){
		return this.containsColumn("wavelength_cal");
	}

	getWavelengthsCal(){
		return this.getDoubleArray("wavelength_cal");
	}

	loadReflectionData(){
		const panelNums = this.getPanelNumbers();
		var xyzObs;
		var anglesObs;
		var xyzCal;
		var anglesCal;
		var millerIndices;
		var wavelengths;
		var wavelengthsCal;

		if (this.containsXYZObs()){
			xyzObs = this.getXYZObs();
		}
		if (this.containsXYZCal()){
			xyzCal = this.getXYZCal();
		}	
		if (this.containsMillerIndices()){
			millerIndices = this.getMillerIndices();
		}
		if (this.containsWavelengths()){
			wavelengths = this.getWavelengths();
		}
		if (this.containsWavelengthsCal()){
			wavelengthsCal = this.getWavelengthsCal();
		}
		if (this.containsRotationAnglesObs()){
			anglesObs = this.getRotationAnglesObs();
		}
		if (this.containsRotationAnglesCal()){
			anglesCal = this.getRotationAnglesCal();
		}

		console.assert(xyzObs || xyzCal);

		var numUnindexed = 0;
		var numIndexed = 0;
		for (var i = 0; i < panelNums.length; i++){
			const panel = panelNums[i];
			const refl = {
				"indexed" : false
			};
			if (xyzObs){
				refl["xyzObs"] = xyzObs[i];
			}
			if (xyzCal){
				refl["xyzCal"] = xyzCal[i];
			}
			if (millerIndices){
				refl["millerIdx"] = millerIndices[i];
				if (this.isValidMillerIndex(millerIndices[i])){
					refl["indexed"] = true;
					refl["id"] = numIndexed;
					this.indexedMap[numIndexed] = millerIndices[i];
					numIndexed++; 
				}
				else{
					refl["id"] = numUnindexed;
					numUnindexed++;
				}
			}
			else{
				refl["id"] = numUnindexed;
				numUnindexed++;
			}
			if (wavelengths){
				refl["wavelength"] = wavelengths[i];
			}
			if (wavelengthsCal){
				refl["wavelengthCal"] = wavelengthsCal[i];
			}
			if (anglesObs){
				refl["angleObs"] = anglesObs[i];
			}
			if (anglesCal){
				refl["angleCal"] = anglesCal[i];
			}
			if (panel in this.reflData){
				this.reflData[panel].push(refl);
			}
			else{
				this.reflData[panel] = [refl];
			}
		}
		this.numReflections = panelNums.length;
	}

	getMillerIndexById(id){
		return this.indexedMap[id];
	}

	getReflectionsForPanel(panelIdx){
		console.assert(this.hasReflTable());
		return this.reflData[panelIdx];
	}
}