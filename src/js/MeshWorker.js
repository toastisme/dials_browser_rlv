// MeshWorker.js
import { ExptParser } from "dials_javascript_parser/ExptParser.js";
import { marchingCubes } from 'marching-cubes-fast';
  
  function createSignedDistanceFunction(meshData, meshShape, isovalue) {
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
  
  self.onmessage = function(e) {
	const { data, meshShape, isovalue, resolution, scanBounds } = e.data;
  
	const decompressed = ExptParser.decompressImageData(data, meshShape);
	const sdf = createSignedDistanceFunction(decompressed, meshShape, isovalue);
	const result = marchingCubes(resolution, sdf, scanBounds);
  
	self.postMessage({ type: 'marchingResult', result });
  };
  