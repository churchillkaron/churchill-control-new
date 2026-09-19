import hashlib
import json
import sys
import unittest
from pathlib import Path

ENGINE = Path("services/avantiqo-image-engine").resolve()
sys.path.insert(0, str(ENGINE))

from still_blueprint_compiler import (  # noqa: E402
    CONTRACT,
    COMPILER_CONTRACT,
    compile_still_blueprint_job,
)


def digest(payload):
    canonical = json.dumps(
        {"contract": CONTRACT, "payload": payload},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def blueprint():
    payload = {
        "canvas": {"orientation": "PORTRAIT", "aspect_ratio": "4:5"},
        "zones": [
            {"role": "HERO", "x": 0.05, "y": 0.34, "width": 0.9, "height": 0.46},
            {"role": "NEGATIVE_SPACE", "x": 0.08, "y": 0.17, "width": 0.84, "height": 0.18},
        ],
        "deterministic_layers": {"logo": True, "typography": True},
        "generation_constraints": {
            "typography_generated_in_pixels": False,
            "logo_generated_in_pixels": False,
            "business_data_generated_in_pixels": False,
        },
    }
    return {
        "contract": CONTRACT,
        "passed": True,
        "blueprint_digest": digest(payload),
        "payload": payload,
        "zero_provider_calls": True,
        "zero_media_generation": True,
        "paid_generation_authority": False,
    }


class StillBlueprintCompilerTests(unittest.TestCase):
    def test_compiles_structured_layout_authority(self):
        job = {
            "input": {
                "capability": "ai.image.generate",
                "instruction": "Premium product campaign visual with refined lighting.",
                "structured_specification": {
                    "requirements": {"still_previsualization_blueprint": blueprint()}
                },
            }
        }
        compiled, evidence = compile_still_blueprint_job(job)
        instruction = compiled["input"]["instruction"]
        self.assertEqual(evidence["contract"], COMPILER_CONTRACT)
        self.assertTrue(evidence["hero_zone_applied"])
        self.assertTrue(evidence["negative_space_preserved"])
        self.assertIn("HERO zone", instruction)
        self.assertIn("NEGATIVE_SPACE zone", instruction)
        self.assertIn("Do not generate readable typography", instruction)
        self.assertIn("Do not generate, redraw or approximate logos", instruction)
        self.assertIn("Do not generate prices, dates, tables, QR codes", instruction)
        self.assertEqual(job["input"]["instruction"], "Premium product campaign visual with refined lighting.")

    def test_rejects_tampered_blueprint(self):
        candidate = blueprint()
        candidate["payload"]["zones"][0]["x"] = 0.2
        job = {
            "input": {
                "capability": "ai.image.generate",
                "instruction": "Product visual.",
                "structured_specification": {
                    "requirements": {"still_previsualization_blueprint": candidate}
                },
            }
        }
        with self.assertRaisesRegex(ValueError, "BLUEPRINT_DIGEST_INVALID"):
            compile_still_blueprint_job(job)

    def test_non_still_job_passes_through(self):
        job = {"input": {"capability": "ai.image.generate", "instruction": "Product visual."}}
        compiled, evidence = compile_still_blueprint_job(job)
        self.assertIs(compiled, job)
        self.assertIsNone(evidence)


if __name__ == "__main__":
    unittest.main()
