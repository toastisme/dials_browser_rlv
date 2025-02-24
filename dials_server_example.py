from typing import Dict
from os.path import exists
from dials.array_family import flex
import json
import asyncio
import websockets
from collections import defaultdict
import base64

"""
Commands
update_experiment
clear_experiment
update_reflection_table
show_rlv_orientation_view
show_rlv_crystal_view
"""


class BasicServer:
	def __init__(self, address, port):
		self.rlv_connection = None
		self.address = address
		self.port = port
		self.expt_json = None

	"""
	Websockets methods
	"""

	async def handle_connection(self, websocket):
		self.rlv_connection = websocket 
		print("Connected to rlv")
		try:
			while True:
				command = input("command:")
				await self.handle_command(command)

		finally:
			self.rlv_connection = None
			print("Lost connection to rlv")

	async def run(self):
		async with websockets.serve(
			self.handle_connection,
			self.address,
			self.port,
			max_size=1000 * 1024 * 1024,
		) as server:
			await asyncio.Future() 

	async def handle_command(self, command):

		if command == "update_experiment":
			expt_path = input(".expt path:")
			await self.update_experiment(expt_path)
		elif command == "update_reflection_table":
			refl_path = input(".refl path:")
			await self.update_reflection_table(refl_path)
		elif command == "show_rlv_orientation_view":
			await self.show_rlv_orientation_view()
		elif command == "show_rlv_crystal_view":
			await self.show_rlv_crystal_view()
		elif command == "clear_experiment":
			await self.clear_experiment()
		else:
			print("Unknown command")


	"""
	Methods to send data to RLV
	"""

	async def update_experiment(self, json_path: str) -> None:
		expt_json = self.get_expt_json(json_path)
		self.expt_json = expt_json
		await self.send_to_rlv(expt_json, command="update_experiment")

	async def update_reflection_table(self, reflection_table_path: str) -> None:
		reflection_table = self.get_reflection_table(reflection_table_path)
		reflection_table = base64.b64encode(reflection_table.as_msgpack()).decode("utf-8")

		await self.send_to_rlv({"refl_msgpack" : reflection_table}, command="update_reflection_table")

	async def show_rlv_orientation_view(self) -> None:
		await self.send_to_rlv({}, command="show_rlv_orientation_view")

	async def show_rlv_crystal_view(self) -> None:
		await self.send_to_rlv({}, command="show_rlv_crystal_view")

	async def clear_experiment(self) -> None:
		await self.send_to_rlv({}, command="clear_experiment")

	"""
	Methods to get data to send
	"""

	def get_expt_json(self, json_path: str) -> Dict:
		assert exists(json_path), f".expt file not found at {json_path}"
		try:
			with open(json_path, "r") as g:
				expt_json = json.load(g)
				return expt_json
		except json.JSONDecodeError:
			raise ValueError(f"Failed to parse {json_path} as json file")

	def get_crystal_ids(self, expt_json: Dict) -> Dict:
		# Returns {expt_id : crystal_id}
		crystal_ids = {"-1" : "-1"}
		for idx, expt in enumerate(expt_json["experiment"]):
			if "crystal" in expt:
				crystal_ids[str(idx)] = expt["crystal"]
			else:
				crystal_ids[str(idx)] = "-1"
		return crystal_ids
			

	def get_reflection_table(self, reflection_table_path: str):
		assert exists(reflection_table_path), f".refl file not found at {reflection_table_path}"
		try:
			reflection_table = flex.reflection_table.from_msgpack_file(reflection_table_path)
			return reflection_table
		except RuntimeError:
			raise RuntimeError(f"Failed to load reflection table at {reflection_table_path}")

	async def send_to_rlv(self, msg, command):
		msg["command"] = command
		msg["channel"] = "rlv"
		assert self.rlv_connection is not None, "Server is not connected to rlv"
		await self.rlv_connection.send(json.dumps(msg))

	def get_detector_params(self, expt_file):
		panels = expt_file["detector"][0]["panels"]
		params = []
		for i in range(len(panels)):
			panels[i]["fast_axis"] = [round(j, 3) for j in panels[i]["fast_axis"]]
			panels[i]["slow_axis"] = [round(j, 3) for j in panels[i]["slow_axis"]]
			panels[i]["origin"] = [round(j, 3) for j in panels[i]["origin"]]
			params.append(
				{
					"Name": panels[i]["name"],
					"Origin (mm)": str(tuple(panels[i]["origin"])),
					"Fast Axis": str(tuple(panels[i]["fast_axis"])),
					"Slow Axis": str(tuple(panels[i]["slow_axis"])),
					"Pixels": str(tuple(panels[i]["image_size"])),
					"Pixel Size (mm)": str(tuple(panels[i]["pixel_size"])),
				}
			)
		return params

	def get_reflections_per_panel(self, reflection_table):
		if reflection_table is None:
			reflection_table_raw = self._get_reflection_table_raw()
		else:
			reflection_table_raw = reflection_table
		if reflection_table_raw is None:
			return None

		refl_data = defaultdict(list)
		self.refl_indexed_map = {}

		contains_xyz_obs = "xyzobs.px.value" in reflection_table_raw
		contains_xyz_obs_mm = "xyzobs.mm.value" in reflection_table_raw
		contains_xyz_cal = "xyzcal.px" in reflection_table_raw
		contains_miller_idxs = "miller_index" in reflection_table_raw
		contains_wavelength = "wavelength" in reflection_table_raw
		contains_wavelength_cal = "wavelength_cal" in reflection_table_raw
		contains_tof_cal = "xyzcal.mm" in reflection_table_raw
		contains_peak_intensities = "peak_intensity" in reflection_table_raw
		contains_bbox = "bbox" in reflection_table_raw
		contains_idx = "idx" in reflection_table_raw

		if "imageset_id" in reflection_table_raw:
			expt_ids = "imageset_id"
		elif "id" in reflection_table_raw:
			expt_ids = "id"
		else:
			expt_ids = None

		crystal_ids = self.get_crystal_ids(self.expt_json)

		num_unindexed = 0
		num_indexed = 0
		panel_names = [i["Name"] for i in self.get_detector_params(self.expt_json)]

		for i in range(len(reflection_table_raw)):
			panel = reflection_table_raw["panel"][i]
			panel_name = panel_names[panel]
			refl = {
				"indexed": False,
				"panelName": panel_name,
			}
			if contains_idx:
				refl["id"] = reflection_table_raw["idx"][i]
			if expt_ids is not None:
				refl["exptID"] = reflection_table_raw[expt_ids][i]
			else:
				refl["exptID"] = 0

			refl["crystalID"] = crystal_ids[str(reflection_table_raw["id"][i])]

			if contains_bbox:
				refl["bbox"] = reflection_table_raw["bbox"][i]

			if contains_xyz_obs:
				refl["xyzObs"] = reflection_table_raw["xyzobs.px.value"][i]

			if contains_xyz_obs_mm:
				refl["tof"] = reflection_table_raw["xyzobs.mm.value"][i][2]

			if contains_xyz_cal:
				refl["xyzCal"] = reflection_table_raw["xyzcal.px"][i]

			if contains_wavelength:
				refl["wavelength"] = reflection_table_raw["wavelength"][i]

			if contains_wavelength_cal:
				refl["wavelengthCal"] = reflection_table_raw["wavelength_cal"][i]

			if contains_tof_cal:
				refl["tofCal"] = reflection_table_raw["xyzcal.mm"][i][2]

			if contains_peak_intensities:
				refl["peakIntensity"] = reflection_table_raw["peak_intensity"][i]

			if contains_miller_idxs:
				miller_idx = reflection_table_raw["miller_index"][i]
				refl["millerIdx"] = miller_idx
				if miller_idx != (0, 0, 0):
					refl["indexed"] = True
					refl["indexed_id"] = num_indexed
					self.refl_indexed_map[num_indexed] = miller_idx
					num_indexed += 1
				else:
					refl["indexed_id"] = num_unindexed
					num_unindexed += 1
			else:
				refl["unindexed_id"] = num_unindexed
				num_unindexed += 1

			refl_data[panel].append(refl)
		return refl_data


def start_server(address="127.0.0.1", port=50010):
	server = BasicServer(address, port)
	asyncio.run(server.run())
	return server
