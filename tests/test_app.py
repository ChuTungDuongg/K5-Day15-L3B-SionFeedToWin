"""Kiểm máy chủ web của codebase/app.py. Chạy: python -m unittest discover -s tests -v"""
import json
import os
import sys
import threading
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "codebase"))
import agent  # noqa: E402
import app  # noqa: E402


class AppServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = app.make_server(0)
        cls.base = "http://127.0.0.1:%d" % cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def post(self, body):
        req = urllib.request.Request(self.base + "/api/answer", data=body, method="POST",
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_page(self):
        with urllib.request.urlopen(self.base + "/") as r:
            self.assertEqual(r.status, 200)
            self.assertIn("VinTrip", r.read().decode("utf-8"))

    def test_answer_returns_output_and_stats(self):
        code, data = self.post(json.dumps({"text": "Nhà mình 2 người lớn."}).encode())
        self.assertEqual(code, 200)
        self.assertIsInstance(data["output"], str)
        self.assertIn("model_calls", data["stats"])

    def test_plan_is_passed_through(self):
        original = agent.answer
        agent.answer = lambda text: {"output": "ok", "plan": {"status": "VALID", "total": 1}}
        try:
            code, data = self.post(json.dumps({"text": "x"}).encode())
        finally:
            agent.answer = original
        self.assertEqual((code, data["plan"]["status"]), (200, "VALID"))

    def test_bad_input_rejected(self):
        self.assertEqual(self.post(b"not json")[0], 400)
        self.assertEqual(self.post(json.dumps({"text": "  "}).encode())[0], 400)
        self.assertEqual(self.post(b"x" * (app.MAX_BODY + 1))[0], 413)


if __name__ == "__main__":
    unittest.main()
