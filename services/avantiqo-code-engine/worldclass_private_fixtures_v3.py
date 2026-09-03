"""Concrete sealed repository fixtures for Avantiqo Code World-Class V3.

The V2 suite defines the dimensions and deterministic case identities. This
module turns each family into an executable broken mini-repository. Public tests
are placed inside the model-visible workspace; hidden tests are materialized in
a sibling sealed directory that Repo Agent V3 cannot resolve or read.

The fixtures intentionally use only the Python standard library so CI can prove
fixture health at zero GPU cost. They are not benchmark-specific source
rewriters and contain no model-visible expected patch.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import worldclass_private_suite_v2 as suite

CONTRACT = "AVANTIQO_CODE_PRIVATE_FIXTURES_V3"
PUBLIC_TEST_RELATIVE = ".avantiqo/public_test.py"
SEALED_DIRNAME = "sealed"
WORKSPACES_DIRNAME = "workspaces"


@dataclass(frozen=True)
class MaterializedFixture:
    case_id: str
    family_id: str
    dimension: str
    task: str
    editable_paths: tuple[str, ...]
    public_test_ids: tuple[str, ...]
    workspace: Path
    public_test_path: Path
    hidden_test_path: Path

    @property
    def public_command(self) -> tuple[str, ...]:
        return (sys.executable, PUBLIC_TEST_RELATIVE)


def _variant_int(secret: bytes, run_seed: str, family_id: str, low: int, high: int) -> int:
    digest = hmac.new(secret, f"fixture:{run_seed}:{family_id}".encode(), hashlib.sha256).digest()
    return low + int.from_bytes(digest[:4], "big") % (high - low + 1)


def _py_test_prelude() -> str:
    return """from pathlib import Path\nimport importlib\nimport sys\nROOT = Path.cwd()\nsys.path.insert(0, str(ROOT))\n"""


def _files_common() -> dict[str, str]:
    return {
        "src/__init__.py": "",
        "src/service/__init__.py": "",
        "src/api/__init__.py": "",
        "src/runtime/__init__.py": "",
        "src/db/__init__.py": "",
        "src/auth/__init__.py": "",
        "src/finance/__init__.py": "",
        "src/orchestration/__init__.py": "",
        "src/providers/__init__.py": "",
        "src/security/__init__.py": "",
        "src/domain/__init__.py": "",
        "src/contracts/__init__.py": "",
        "src/producer/__init__.py": "",
        "src/consumer/__init__.py": "",
    }


def _multifile_typescript(n: int) -> tuple[dict[str, str], str, str, str]:
    files = {
        "src/service/order.py": f"""def load_order(order_id: str) -> dict:\n    return {{\"id\": order_id, \"amount_cents\": {n}}}\n""",
        "src/api/order.py": """from src.service.order import load_order\n\ndef get_order(order_id: str) -> dict:\n    order = load_order(order_id)\n    return {\"id\": order[\"id\"], \"total_cents\": order[\"total_cents\"]}\n""",
    }
    public = _py_test_prelude() + f"""from src.api.order import get_order\nassert get_order('o-1') == {{'id': 'o-1', 'total_cents': {n}}}\n"""
    hidden = _py_test_prelude() + f"""from src.service.order import load_order\nfrom src.api.order import get_order\nassert load_order('x')['total_cents'] == {n}\nassert 'amount_cents' not in load_order('x')\nassert get_order('x')['total_cents'] == {n}\n"""
    task = "Repair the cross-file service/API field contract without changing the public API response shape."
    return files, public, hidden, task


def _sql_migration(n: int) -> tuple[dict[str, str], str, str, str]:
    files = {
        "supabase/migrations/20260903_invoice_status.sql": "ALTER TABLE invoices ADD COLUMN status TEXT NOT NULL;\n",
    }
    public = _py_test_prelude() + f"""import sqlite3\nsql = (ROOT / 'supabase/migrations/20260903_invoice_status.sql').read_text()\ndb = sqlite3.connect(':memory:')\ndb.execute('CREATE TABLE invoices(id INTEGER PRIMARY KEY, amount INTEGER NOT NULL)')\ndb.execute('INSERT INTO invoices(amount) VALUES (?)', ({n},))\ndb.executescript(sql)\nrow = db.execute('SELECT amount, status FROM invoices').fetchone()\nassert row == ({n}, 'open')\n"""
    hidden = _py_test_prelude() + """import sqlite3\nsql = (ROOT / 'supabase/migrations/20260903_invoice_status.sql').read_text()\nassert 'DROP TABLE' not in sql.upper()\ndb = sqlite3.connect(':memory:')\ndb.execute('CREATE TABLE invoices(id INTEGER PRIMARY KEY, amount INTEGER NOT NULL)')\ndb.executemany('INSERT INTO invoices(amount) VALUES (?)', [(10,), (20,)])\ndb.executescript(sql)\nassert db.execute('SELECT COUNT(*) FROM invoices').fetchone()[0] == 2\nassert db.execute('SELECT DISTINCT status FROM invoices').fetchall() == [('open',)]\n"""
    task = "Make the SQL migration forward-safe for existing invoice rows; existing rows must remain and receive status 'open'."
    return files, public, hidden, task


def _concurrent_claim(n: int) -> tuple[dict[str, str], str, str, str]:
    files = {
        "src/runtime/claim.py": """import time\n\nclass ClaimStore:\n    def __init__(self):\n        self.claimed = set()\n        self.effects = 0\n\n    def claim(self, key: str) -> bool:\n        if key in self.claimed:\n            return False\n        time.sleep(0.002)\n        self.claimed.add(key)\n        self.effects += 1\n        return True\n""",
    }
    public = _py_test_prelude() + f"""from concurrent.futures import ThreadPoolExecutor\nfrom src.runtime.claim import ClaimStore\ns = ClaimStore()\nwith ThreadPoolExecutor(max_workers={min(n, 12)}) as pool:\n    results = list(pool.map(lambda _: s.claim('same'), range({max(8, n)})))\nassert sum(results) == 1\nassert s.effects == 1\n"""
    hidden = _py_test_prelude() + """from concurrent.futures import ThreadPoolExecutor\nfrom src.runtime.claim import ClaimStore\ns = ClaimStore()\nkeys = ['a'] * 20 + ['b'] * 20\nwith ThreadPoolExecutor(max_workers=16) as pool:\n    results = list(pool.map(s.claim, keys))\nassert sum(results) == 2\nassert s.effects == 2\nassert s.claim('a') is False\n"""
    task = "Make ClaimStore.claim thread-safe and idempotent so one logical key can cause at most one effect."
    return files, public, hidden, task


def _auth_precedence(n: int) -> tuple[dict[str, str], str, str, str]:
    files = {
        "src/auth/policy.py": """def can_manage(user: dict, resource: dict) -> bool:\n    if user.get('role') == 'admin':\n        return True\n    if user.get('disabled') or resource.get('archived'):\n        return False\n    return user.get('organization_id') == resource.get('organization_id') and user.get('role') in {'manager', 'admin'}\n""",
    }
    public = _py_test_prelude() + f"""from src.auth.policy import can_manage\nr = {{'organization_id': 'org-{n}', 'archived': False}}\nassert can_manage({{'organization_id':'org-{n}','role':'admin','disabled':True}}, r) is False\nassert can_manage({{'organization_id':'org-{n}','role':'manager','disabled':False}}, r) is True\n"""
    hidden = _py_test_prelude() + f"""from src.auth.policy import can_manage\nassert can_manage({{'organization_id':'other','role':'admin','disabled':False}}, {{'organization_id':'org-{n}','archived':False}}) is False\nassert can_manage({{'organization_id':'org-{n}','role':'admin','disabled':False}}, {{'organization_id':'org-{n}','archived':True}}) is False\n"""
    task = "Repair authorization precedence: disabled users, archived resources, and organization mismatch must deny even privileged roles."
    return files, public, hidden, task


def _ledger_rounding(n: int) -> tuple[dict[str, str], str, str, str]:
    files = {
        "src/finance/ledger.py": """from decimal import Decimal, ROUND_HALF_UP\n\ndef total(rows):\n    cents = Decimal('0.01')\n    return sum(Decimal(str(row.get('amount', 0))).quantize(cents, rounding=ROUND_HALF_UP) for row in rows)\n""",
    }
    public = _py_test_prelude() + """from decimal import Decimal\nfrom src.finance.ledger import total\nassert total([{'amount':'0.005'}, {'amount':'0.005'}]) == Decimal('0.01')\n"""
    hidden = _py_test_prelude() + f"""from decimal import Decimal\nfrom src.finance.ledger import total\nassert total([{{'amount':'{n}.004'}}, {{'amount':'0.004'}}]) == Decimal('{n}.01')\nassert total([]) == Decimal('0.00')\n"""
    task = "Repair accounting aggregation so raw amounts are summed first and the final total is rounded once to cents."
    return files, public, hidden, task


def _next_boundary(n: int) -> tuple[dict[str, str], str, str, str]:
    files = {
        "app/orders/page.tsx": """import OrderPanel from '../../components/OrderPanel'\nimport { db } from '../../src/db/server'\n\nexport default async function Page() {\n  const row = await db.order()\n  return <OrderPanel order={row} />\n}\n""",
        "components/OrderPanel.tsx": """'use client'\nimport { db } from '../src/db/server'\n\nexport default function OrderPanel({ order }: { order: any }) {\n  return <div>{order.id}</div>\n}\n""",
        "src/db/server.ts": "export const db = { order: async () => ({ id: 'x', createdAt: new Date() }) }\n",
    }
    public = _py_test_prelude() + """client = (ROOT / 'components/OrderPanel.tsx').read_text()\nassert "'use client'" in client or '"use client"' in client\nassert 'src/db/server' not in client\npage = (ROOT / 'app/orders/page.tsx').read_text()\nassert 'toISOString' in page\n"""
    hidden = _py_test_prelude() + """client = (ROOT / 'components/OrderPanel.tsx').read_text()\npage = (ROOT / 'app/orders/page.tsx').read_text()\nassert 'db' not in client\nassert 'createdAt' in page and 'toISOString' in page\nassert '<OrderPanel' in page\n"""
    task = "Repair the Next.js server/client boundary: the client component must not import server DB code and props must be serializable."
    return files, public, hidden, task


def _external_dispatch(n: int) -> tuple[dict[str, str], str, str, str]:
    files = {
        "src/orchestration/dispatch.py": """class Dispatcher:\n    def __init__(self, provider):\n        self.provider = provider\n        self.states = {}\n\n    def run(self, key: str):\n        if self.states.get(key) == 'sent':\n            return 'sent'\n        self.provider.send(key)\n        self.states[key] = 'sent'\n        return 'sent'\n""",
    }
    public = _py_test_prelude() + """from src.orchestration.dispatch import Dispatcher\nclass P:\n    def __init__(self): self.calls = 0\n    def send(self, key):\n        self.calls += 1\n        if self.calls == 1: raise TimeoutError('ambiguous')\np=P(); d=Dispatcher(p)\ntry: d.run('k')\nexcept TimeoutError: pass\ntry: d.run('k')\nexcept TimeoutError: pass\nassert p.calls == 1\nassert d.states['k'] == 'uncertain'\n"""
    hidden = _py_test_prelude() + """from src.orchestration.dispatch import Dispatcher\nclass P:\n    def __init__(self): self.calls=[]\n    def send(self, key): self.calls.append(key)\np=P(); d=Dispatcher(p)\nassert d.run('a') == 'sent'\nassert d.run('a') == 'sent'\nassert p.calls == ['a']\n"""
    task = "Guarantee at-most-once external dispatch. Claim before sending; ambiguous provider failure must become 'uncertain' and never auto-send again."
    return files, public, hidden, task


def _hot_path(n: int) -> tuple[dict[str, str], str, str, str]:
    files = {
        "src/runtime/hot.py": """def intersect(a, b, eq):\n    out = []\n    for left in a:\n        for right in b:\n            if eq(left, right):\n                out.append(left)\n                break\n    return out\n""",
    }
    public = _py_test_prelude() + f"""from src.runtime.hot import intersect\nclass Eq:\n    def __init__(self): self.calls=0\n    def __call__(self,a,b): self.calls+=1; return a==b\neq=Eq(); a=list(range({max(40,n)})); b=list(range({max(40,n)}))\nassert intersect(a,b,eq) == a\nassert eq.calls <= {max(40,n)} * 3\n"""
    hidden = _py_test_prelude() + """from src.runtime.hot import intersect\nclass Eq:\n    def __init__(self): self.calls=0\n    def __call__(self,a,b): self.calls+=1; return a==b\neq=Eq(); assert intersect([3,1,3,2],[2,3],eq) == [3,3,2]\nassert eq.calls <= 16\n"""
    task = "Reduce avoidable comparison work on the hot path while preserving output order and duplicate behavior."
    return files, public, hidden, task


def _security_boundary(n: int) -> tuple[dict[str, str], str, str, str]:
    files = {
        "src/security/files.py": """from pathlib import Path\n\ndef read_user_file(root: str, requested: str) -> str:\n    path = Path(root) / requested\n    return path.read_text()\n""",
    }
    public = _py_test_prelude() + """import tempfile\nfrom pathlib import Path\nfrom src.security.files import read_user_file\nwith tempfile.TemporaryDirectory() as d:\n    root=Path(d)/'root'; root.mkdir(); (root/'ok.txt').write_text('ok'); (Path(d)/'secret.txt').write_text('secret')\n    assert read_user_file(str(root),'ok.txt') == 'ok'\n    try: read_user_file(str(root),'../secret.txt')\n    except ValueError: pass\n    else: raise AssertionError('traversal allowed')\n"""
    hidden = _py_test_prelude() + """import tempfile\nfrom pathlib import Path\nfrom src.security.files import read_user_file\nwith tempfile.TemporaryDirectory() as d:\n    root=Path(d)/'root'; root.mkdir(); outside=Path(d)/'outside'; outside.mkdir(); (outside/'x').write_text('x')\n    link=root/'link'\n    try: link.symlink_to(outside, target_is_directory=True)\n    except OSError: raise SystemExit(0)\n    try: read_user_file(str(root),'link/x')\n    except ValueError: pass\n    else: raise AssertionError('symlink escape allowed')\n"""
    task = "Close path traversal and symlink escape in read_user_file while preserving reads of normal files inside root."
    return files, public, hidden, task


def _refactor_contract(n: int) -> tuple[dict[str, str], str, str, str]:
    files = {
        "src/domain/names.py": """def customer_label(name):\n    return ' '.join(str(name).strip().split()).title()\n\ndef supplier_label(name):\n    return ' '.join(str(name).strip().split()).upper()\n""",
    }
    public = _py_test_prelude() + """from src.domain.names import customer_label, supplier_label\nassert customer_label('  acme   co ') == 'Acme Co'\nassert supplier_label('  acme   co ') == 'Acme Co'\n"""
    hidden = _py_test_prelude() + """from src.domain.names import customer_label, supplier_label\nfor value in ['john doe','  mixed CASE  ','x']:\n    assert customer_label(value) == supplier_label(value)\n"""
    task = "Refactor duplicated label normalization behind one behavior-preserving contract; customer and supplier labels must stay identical."
    return files, public, hidden, task


def _malformed_inputs(n: int) -> tuple[dict[str, str], str, str, str]:
    files = {
        "src/api/normalize.py": """def normalize_name(value):\n    return value.strip().lower()\n""",
    }
    public = _py_test_prelude() + """from src.api.normalize import normalize_name\nassert normalize_name('  Alice ') == 'alice'\nassert normalize_name(None) == ''\nassert normalize_name(123) == ''\n"""
    hidden = _py_test_prelude() + """from src.api.normalize import normalize_name\nfor value in [None, 0, 1.2, [], {}, float('nan')]: assert normalize_name(value) == ''\nassert normalize_name('  A  B ') == 'a  b'\n"""
    task = "Make normalize_name total and deterministic: only strings normalize; malformed/non-string inputs return the empty string."
    return files, public, hidden, task


def _api_version_skew(n: int) -> tuple[dict[str, str], str, str, str]:
    files = {
        "src/contracts/order.py": "FIELDS = ('id', 'total_cents')\n",
        "src/producer/order.py": f"""def produce(order_id):\n    return {{'id': order_id, 'amount_cents': {n}}}\n""",
        "src/consumer/order.py": """def consume(payload):\n    return f\"{payload['id']}:{payload['total_cents']}\"\n""",
    }
    public = _py_test_prelude() + f"""from src.producer.order import produce\nfrom src.consumer.order import consume\nassert consume(produce('o')) == 'o:{n}'\n"""
    hidden = _py_test_prelude() + """from src.contracts.order import FIELDS\nfrom src.producer.order import produce\np=produce('x')\nassert tuple(p.keys()) == FIELDS\nassert 'amount_cents' not in p\n"""
    task = "Repair producer/consumer version skew so the shared order contract is the single field authority."
    return files, public, hidden, task


def _ledger_extra(_: int) -> tuple[dict[str, str], str, str, str]:
    raise AssertionError("unused")


def _next_malformed(family_id: str) -> Callable[[int], tuple[dict[str, str], str, str, str]]:
    builders = {
        "ts_service_api_contract": _multifile_typescript,
        "sql_finance_migration": _sql_migration,
        "concurrent_claim": _concurrent_claim,
        "auth_precedence": _auth_precedence,
        "ledger_rounding": _ledger_rounding,
        "next_boundary": _next_boundary,
        "external_dispatch": _external_dispatch,
        "hot_path": _hot_path,
        "unsafe_boundary": _security_boundary,
        "refactor_contract": _refactor_contract,
        "malformed_inputs": _malformed_inputs,
        "api_version_skew": _api_version_skew,
    }
    return builders[family_id]


def materialize_fixture(root: str | Path, *, secret: bytes, run_seed: str, family: suite.TaskFamily) -> MaterializedFixture:
    if not secret:
        raise ValueError("PRIVATE_SUITE_SECRET_REQUIRED")
    if not run_seed.strip():
        raise ValueError("RUN_SEED_REQUIRED")
    base = Path(root).resolve()
    case_id = f"{family.family_id}-{suite.variant_id(secret, run_seed, family)}"
    workspace = base / WORKSPACES_DIRNAME / case_id
    sealed = base / SEALED_DIRNAME / case_id
    shutil.rmtree(workspace, ignore_errors=True)
    shutil.rmtree(sealed, ignore_errors=True)
    workspace.mkdir(parents=True, exist_ok=True)
    sealed.mkdir(parents=True, exist_ok=True)

    n = _variant_int(secret, run_seed, family.family_id, 8, 97)
    files, public_test, hidden_test, task = _next_malformed(family.family_id)(n)
    merged = _files_common()
    merged.update(files)
    merged[PUBLIC_TEST_RELATIVE] = public_test
    for relative, content in merged.items():
        target = workspace / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    hidden_path = sealed / "hidden_test.py"
    hidden_path.write_text(hidden_test, encoding="utf-8")
    metadata = {
        "contract": CONTRACT,
        "case_id": case_id,
        "family_id": family.family_id,
        "dimension": family.dimension,
        "hidden_material_model_visible": False,
    }
    (sealed / "metadata.json").write_text(json.dumps(metadata, sort_keys=True) + "\n", encoding="utf-8")
    return MaterializedFixture(
        case_id=case_id,
        family_id=family.family_id,
        dimension=family.dimension,
        task=task,
        editable_paths=family.editable_paths,
        public_test_ids=family.public_test_ids,
        workspace=workspace,
        public_test_path=workspace / PUBLIC_TEST_RELATIVE,
        hidden_test_path=hidden_path,
    )


def materialize_suite(root: str | Path, *, secret: bytes, run_seed: str) -> list[MaterializedFixture]:
    return [materialize_fixture(root, secret=secret, run_seed=run_seed, family=family) for family in suite.families()]


def run_public(fixture: MaterializedFixture, timeout: int = 20) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        list(fixture.public_command),
        cwd=fixture.workspace,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
        shell=False,
    )


def run_hidden(fixture: MaterializedFixture, timeout: int = 20) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(fixture.hidden_test_path)],
        cwd=fixture.workspace,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
        shell=False,
    )
