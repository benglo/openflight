"""OpenGolfSim launch-monitor integration over TCP (port 3111).

Reference: https://help.opengolfsim.com/desktop/apis/
"""

from .client import OpenGolfSimClient
from .protocol import DEFAULT_HOST, DEFAULT_PORT

__all__ = ["DEFAULT_HOST", "DEFAULT_PORT", "OpenGolfSimClient"]
