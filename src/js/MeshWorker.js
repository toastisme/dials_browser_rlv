// MeshWorker.js
import { marchingCubes } from 'marching-cubes-fast';
import { decode } from "@ygoe/msgpack";
import pako from 'pako';
  
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

	function decompressImageData(msg) {

		// Assumes msg is a Msgpack object of a compressed array

		msg = decode(msg);
		const { data: compressedData, shape, dtype } = msg;

		const decompressed = pako.inflate(compressedData);

		let TypedArray;
		switch (dtype) {
			case "float32":
				TypedArray = Float32Array;
				break;
			case "float64":
				TypedArray = Float64Array;
				break;
			case "int32":
				TypedArray = Int32Array;
				break;
			default:
				throw new Error(`Unsupported data type: ${dtype}`);
		}

		const dataArray = new TypedArray(
			decompressed.buffer,
			decompressed.byteOffset,
			decompressed.byteLength / TypedArray.BYTES_PER_ELEMENT
		);

		// Reshape
		if (shape.length === 2) {
			const [height, width] = shape;
			if (dataArray.length !== height * width) {
				throw new Error("Data length mismatch for 2D reshape");
			}
			return Array.from({ length: height }, (_, y) =>
				dataArray.slice(y * width, (y + 1) * width)
			);
		} else if (shape.length === 3) {
			const [depth, height, width] = shape;
			if (dataArray.length !== depth * height * width) {
				throw new Error("Data length mismatch for 3D reshape");
			}
			return Array.from({ length: depth }, (_, d) =>
				Array.from({ length: height }, (_, h) =>
					dataArray.slice(
						(d * height * width) + (h * width),
						(d * height * width) + ((h + 1) * width)
					)
				)
			);
		} else {
			throw new Error("Only 2D and 3D arrays are supported");
		}
	}

  self.onmessage = function(e) {
	const { data, meshShape, isovalue, resolution, scanBounds } = e.data;
  
  const decompressed = decompressImageData(data);
	const sdf = createSignedDistanceFunction(decompressed, meshShape, isovalue);
  const result = marchingCubes(resolution, sdf, scanBounds);
  
	self.postMessage({ type: 'marchingResult', result });
  };
  