from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import base64
from os.path import exists
from queue import Queue
from dials.array_family import flex

class RequestHandler(BaseHTTPRequestHandler):

    command_queue = Queue()

    def do_OPTIONS(self) -> None:

        """Handle preflight CORS requests"""

        self.send_response(200)
        self._send_header_cors()
        self.end_headers()
        
    def do_POST(self) -> None:

        """
        Called by Python process using DIALS to generate data to be sent
        to ReciprocalLatticeViewer when requested
        """

        self.send_response(200)
        self._send_header_cors()
        self.end_headers()
        
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else b'{}'
        
        try:
            request_data = json.loads(post_data)
        except json.JSONDecodeError:
            request_data = {}

        if "command" not in request_data:
            self.send_error(404, "Not Found")
            return

        command = request_data["command"]

        if command == "update_experiment":
            assert "expt_path" in request_data
            self.update_experiment(request_data["expt_path"])

        elif command == "update_reflection_table":
            assert "refl_path" in request_data
            self.update_reflection_table(request_data["refl_path"])
        
        elif command == "clear_experiment":
            self.clear_experiment()

        elif command == "show_orientation_view":
            self.show_orientation_view()

        elif command == "show_crystal_view":
            self.show_crystal_view()

        else:
            self.send_error(404, f"Unknown command: {command}")
            
    def do_GET(self) -> None:
        self.send_response(200)
        self._send_header_cors()
        self.end_headers()

        commands_json = {"commands" : [] }

        while not self.command_queue.empty():
            command_json = self.command_queue.get()
            commands_json["commands"].append(command_json)

        self.wfile.write(json.dumps(commands_json).encode("utf-8"))

    def _send_header_cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "X-API-Key, Content-Type, Access-Control-Allow-Origin, Access-Control-Allow-Methods, Access-Control-Allow-Headers")

    def send_error(self, code : int, message : str | None=None) -> None:
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._send_header_cors() 
        self.end_headers()
        response = {
            "status": "error",
            "code": code,
            "message": message if message else self.responses[code][0]
        }
        self.wfile.write(json.dumps(response).encode("utf-8"))

    """
    Methods to add commands to the command queue
    """

    def update_experiment(self, json_path: str) -> None:
        expt_json = self.get_expt_json(json_path)
        self.command_queue.put({"command" : "update_experiment", "expt_json" : expt_json})

    def update_reflection_table(self, reflection_table_path: str) -> None:
        reflection_table = self.get_reflection_table(reflection_table_path)
        reflection_table = base64.b64encode(reflection_table.as_msgpack()).decode("utf-8")
        self.command_queue.put({"command" : "update_reflection_table", "refl_msgpack": reflection_table})

    def show_orientation_view(self) -> None:
        self.command_queue.put({"command" : "show_orientation_view"})

    def show_crystal_view(self) -> None:
        self.command_queue.put({"command" : "show_crystal_view"})

    def clear_experiment(self) -> None:
        self.command_queue.put({"command" : "clear_experiment"})

    """
    Methods for parsing data files
    """

    def get_expt_json(self, json_path: str) -> dict:
        assert exists(json_path), f".expt file not found at {json_path}"
        try:
            with open(json_path, "r") as g:
                return json.load(g)
        except json.JSONDecodeError:
            raise ValueError(f"Failed to parse {json_path} as JSON file")

    def get_reflection_table(self, reflection_table_path: str) -> flex.reflection_table:
        assert exists(reflection_table_path), f".refl file not found at {reflection_table_path}"
        try:
            return flex.reflection_table.from_msgpack_file(reflection_table_path)
        except RuntimeError:
            raise RuntimeError(f"Failed to load reflection table at {reflection_table_path}")


if __name__ == "__main__":
    address = "127.0.0.1"
    port = 50010
    server_url = "http://127.0.0.1:50010"  
    server_address = (address, port)
    httpd = HTTPServer(server_address, RequestHandler)
    print(f"Starting server on port {port} with CORS support...")
    print("Available endpoints:")
    print("  GET  - returns all current commands")
    print("  POST /update_experiment")
    print("  POST /update_reflection_table")
    print("  POST /clear_experiment")
    print("  POST /show_orientation_view")
    print("  POST /show_crystal_view")
    httpd.serve_forever()
