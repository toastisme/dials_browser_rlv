from typing import Dict
from os.path import exists
from dials.array_family import flex
import json
import asyncio
import websockets
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

	async def send_to_rlv(self, msg, command):
		msg["command"] = command
		msg["channel"] = "rlv"
		assert self.rlv_connection is not None, "Server is not connected to rlv"
		await self.rlv_connection.send(json.dumps(msg))

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


	def get_reflection_table(self, reflection_table_path: str):
		assert exists(reflection_table_path), f".refl file not found at {reflection_table_path}"
		try:
			reflection_table = flex.reflection_table.from_msgpack_file(reflection_table_path)
			return reflection_table
		except RuntimeError:
			raise RuntimeError(f"Failed to load reflection table at {reflection_table_path}")


def start_server(address="127.0.0.1", port=50010):
	server = BasicServer(address, port)
	asyncio.run(server.run())

	return server
