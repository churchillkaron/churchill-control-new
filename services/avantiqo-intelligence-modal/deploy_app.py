"""
Legacy external Intelligence service compatibility stub.

Avantiqo Intelligence is LOCAL_ONLY. This file intentionally contains no external
provider SDK, external GPU, credential, deployment, or provider-job execution path.
"""

EXTERNAL_COMPUTE_ALLOWED = False
INFRASTRUCTURE_POLICY = "AVANTIQO_LOCAL_ONLY"

def disabled(*_args, **_kwargs):
    raise RuntimeError("AVANTIQO_INTELLIGENCE_LOCAL_RUNTIME_REQUIRED")

def main():
    disabled()

if __name__ == "__main__":
    main()
