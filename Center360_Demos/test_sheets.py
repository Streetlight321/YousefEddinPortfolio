"""
Smoke test for the Google Sheets connection.

Reads service account credentials and the sheet ID from .env,
authenticates, and tries to pull the first few rows of the
"Student_Overview" tab. Prints PASS / FAIL with details.

Usage:
    pip install -r requirements.txt
    python test_sheets.py
"""

import os
import sys

from dotenv import load_dotenv
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
STUDENT_TAB = "Student_Overview"
RANGE = f"{STUDENT_TAB}!A1:G10"  # header + first 9 rows


def build_credentials_from_env():
    """Reconstruct a service account credentials object from .env vars."""
    required = [
        "GOOGLE_PROJECT_ID",
        "GOOGLE_PRIVATE_KEY_ID",
        "GOOGLE_PRIVATE_KEY",
        "GOOGLE_CLIENT_EMAIL",
        "GOOGLE_CLIENT_ID",
    ]
    missing = [k for k in required if not os.getenv(k)]
    if missing:
        raise RuntimeError(f"Missing env vars: {', '.join(missing)}")

    # .env stores \n as literal backslash-n; turn them into real newlines.
    private_key = os.environ["GOOGLE_PRIVATE_KEY"].replace("\\n", "\n")

    info = {
        "type": "service_account",
        "project_id": os.environ["GOOGLE_PROJECT_ID"],
        "private_key_id": os.environ["GOOGLE_PRIVATE_KEY_ID"],
        "private_key": private_key,
        "client_email": os.environ["GOOGLE_CLIENT_EMAIL"],
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "token_url": "https://oauth2.googleapis.com/token",
    }
    return Credentials.from_service_account_info(info, scopes=SCOPES)


def main():
    load_dotenv()

    sheet_id = os.getenv("GOOGLE_SHEET_ID")
    if not sheet_id:
        print("FAIL: GOOGLE_SHEET_ID is not set in .env")
        sys.exit(1)

    try:
        creds = build_credentials_from_env()
    except Exception as e:
        print(f"FAIL: could not build credentials → {e}")
        sys.exit(1)

    print(f"Authenticated as: {creds.service_account_email}")
    print(f"Target sheet ID:  {sheet_id}")
    print(f"Target range:     {RANGE}")
    print("-" * 60)

    try:
        service = build("sheets", "v4", credentials=creds, cache_discovery=False)
        result = (
            service.spreadsheets()
            .values()
            .get(spreadsheetId=sheet_id, range=RANGE)
            .execute()
        )
    except HttpError as e:
        print(f"FAIL: Google API error → {e}")
        print("\nCommon causes:")
        print(f"  - Sheet is not shared with {creds.service_account_email}")
        print(f"  - Tab name is not exactly '{STUDENT_TAB}'")
        print(f"  - Sheet ID is wrong")
        sys.exit(1)
    except Exception as e:
        print(f"FAIL: unexpected error → {e}")
        sys.exit(1)

    rows = result.get("values", [])
    if not rows:
        print("FAIL: connected, but the range returned no data.")
        sys.exit(1)

    print(f"PASS: pulled {len(rows)} row(s) from '{STUDENT_TAB}'.\n")
    for i, row in enumerate(rows):
        prefix = "HEADER" if i == 0 else f"row {i:>3}"
        print(f"  {prefix}: {row}")


if __name__ == "__main__":
    main()
