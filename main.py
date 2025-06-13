import os
import time
import asyncio
import aiohttp
import logging
from datetime import timedelta

# Constants
PING_DELAY = timedelta(minutes=5)  # Ping interval
TARGET_URL = "https://replit.com/@monarchshadow69/Castle-keepalive"  # Your specific repl
RETRY_ATTEMPTS = 3  # Number of retries for failed pings
RETRY_DELAY = 2  # Delay between retries in seconds

async def ping_repl(session):
    """Ping the target repl with retries."""
    logger = logging.getLogger("pinger")

    for attempt in range(RETRY_ATTEMPTS):
        try:
            async with session.get(TARGET_URL, timeout=10) as response:
                if response.status == 200:
                    logger.info(f"✓ Pinged successfully - Status: {response.status}")
                    return
                else:
                    logger.warning(f"⚠ Ping returned status: {response.status}")
        except asyncio.TimeoutError:
            logger.error(f"✗ Ping timed out (Attempt {attempt + 1}/{RETRY_ATTEMPTS})")
        except Exception as e:
            logger.error(f"✗ Ping failed: {str(e)} (Attempt {attempt + 1}/{RETRY_ATTEMPTS})")

        if attempt < RETRY_ATTEMPTS - 1:
            await asyncio.sleep(RETRY_DELAY)  # Short delay before retrying

async def main_loop():
    """Main keepalive loop with graceful shutdown handling."""
    logger = logging.getLogger("pinger")
    logger.info("Starting keepalive service")
    logger.info(f"Target: {TARGET_URL}")
    logger.info(f"Ping interval: {PING_DELAY.total_seconds()} seconds")

    async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(limit=10)) as session:
        while True:
            await ping_repl(session)
            await asyncio.sleep(PING_DELAY.total_seconds())

if __name__ == "__main__":
    # Prevent bytecode files to save memory
    os.environ["PYTHONDONTWRITEBYTECODE"] = "1"

    # Set timezone
    os.environ["TZ"] = "Australia/Sydney"
    time.tzset()

    # Setup logging
    logger = logging.getLogger("pinger")
    logger.setLevel(logging.INFO)

    # Console logging only (saves memory)
    handler = logging.StreamHandler()
    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    # Run the keepalive loop with graceful shutdown
    try:
        asyncio.run(main_loop())
    except KeyboardInterrupt:
        logger.info("Keepalive service stopped gracefully")