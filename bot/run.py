#!/usr/bin/env python3
"""Start the pilot.

    python run.py            open the launcher
    python run.py --check    report what is installed and what is missing
    python run.py --game illegal_soccer --role goalkeeper
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def _main() -> int:
    # Handle --check before importing the app: the whole point of the check is
    # to diagnose a machine where the GUI imports would fail.
    if "--check" in sys.argv[1:]:
        from pilot.doctor import run
        return run()

    from pilot.app import main
    return main()


if __name__ == "__main__":
    raise SystemExit(_main())
