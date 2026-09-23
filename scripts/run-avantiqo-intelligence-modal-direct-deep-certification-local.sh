#!/bin/sh
echo '{"success":false,"error":"AVANTIQO_INTELLIGENCE_LOCAL_RUNTIME_REQUIRED","infrastructure_policy":"AVANTIQO_LOCAL_ONLY","external_compute_allowed":false,"external_provider_job_submitted":false,"production_deploy_performed":false}' >&2
exit 2
