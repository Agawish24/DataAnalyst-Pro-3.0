# Uptime stats for this repl available at
# https://stats.uptimerobot.com/M1NrQcXJv/788807829

import os
import re
import time
import base64
import jinja2
import asyncio
import aiohttp
import graphql
import logging
import traceback

from aiohttp import web
from datetime import datetime, timedelta
from website.middlewares import middlewares

# Constants
PING_REPLS_DELAY  = timedelta(minutes=3)
FETCH_REPLS_DELAY = timedelta(minutes=90)

# Setup
app = web.Application(middlewares=middlewares)
routes = web.RouteTableDef()
username = os.environ["REPL_OWNER"] or "chocolatejade42"

# Website routes
@routes.get("/")
async def index(request: web.Request):
    # Test if it's Uptime robot so we don't spam full logs and risk timeout
    if auth := request.headers.get("Authorization"):
        authuser, authpass = base64.b64decode(auth[6:]).decode().split(":")
        
        if authuser == "UPTIMEROBOT":
            return web.Response(text="This repl is alive!")
    
    # Read files
    with open("website/index.html") as fp:
        template = jinja2.Template(fp.read())
    
    with open("requests.log") as fp:
        rawsoup = fp.read().replace("WARNING", "WARN")
        rawsoup = rawsoup.replace("<", "&lt;").replace(">", "&gt;").replace("&", "&amp;")
    
    # Apply potential search filter
    if (query := request.query.get("search")):
        filtered = [line for line in rawsoup.split("\n") if query.lower() in line.lower()]
        rawsoup = "\n".join(filtered)

    # Jinja variables
    linepattern = re.compile(r"([0-9\/: ]+) (\[(?:[A-Z])+\])\t(.+)")
    levelsafe = {
        "[DEBUG]": "debug",
        "[INFO]": "info",
        "[WARN]": "warn",
        "[ERROR]": "error",
    }

    # Render template and return to user
    html = template.render(
        username=username,
        rawsoup=rawsoup,
        linepattern=linepattern,
        findall=re.findall,
        levelsafe=levelsafe,
        len=len,
    ).replace("\n", "").replace("  ", "")

    return web.Response(body=html, content_type="text/html")

@routes.get("/requests.log")
async def rawlog_route(request: web.Request):
    with open("requests.log") as fp:
        return web.Response(text=fp.read())

@routes.get("/favicon.png")
async def favicon_route(request: web.Request):
    return web.FileResponse("website/favicon.png")


# Pinger helpers
async def create_task(function, delaydelta: timedelta):
    """Create the periodic task.
    This function is run once to setup the task"""
    urls = await graphql.get_keepalive_repls()
    lasturlcheck = datetime.now()

    delay = delaydelta.total_seconds()
    logger = logging.getLogger("pinger")
    logger.info("Restarting this repl")

    while True:
        start = time.time()
        
        # Check if URLs need to be updated
        if lasturlcheck + FETCH_REPLS_DELAY < datetime.now():
            urls = await graphql.get_keepalive_repls()
            lasturlcheck = datetime.now()

        # Run task
        await function(logger, urls)
        
        # Calculate delay required
        end = time.time()
        required = max(delay - (end - start), 0)
        await asyncio.sleep(required)

async def ping_task(logger: logging.Logger, urls: dict):
    """Pings all the repls in the cache once.
    This function is run multiple times to ping each server"""
    with open("requests.log", "a") as fp:
        fp.write("\n")

    logger.info(f"Preparing to ping {len(urls.keys())} repls")
    
    async def inner(name: str, url: str):
        try:
            async with sess.get(url) as pingresp:
                pingresp.raise_for_status()
                logger.debug(f"{pingresp.status} {name} {url}")
            return pingresp.status
        except aiohttp.ClientError:
            logger.warning(f"{pingresp.status} {name} {url}")
            return pingresp.status
        except Exception as egg:
            trace = traceback.format_exception(type(err), err, err.__traceback__)
            logger.error("".join(trace))
            return 502

    async with aiohttp.ClientSession() as sess:
        tasks = (inner(name, url) for name, url in urls.items())
        resps = await asyncio.gather(*tasks)


if __name__ == "__main__":
    # Set timezone
    os.environ["TZ"] = "Australia/Sydney"
    time.tzset()

    # Enable logging
    logger = logging.getLogger("pinger")
    logger.setLevel(logging.DEBUG)

    with open("requests.log", "a") as fp:
        fp.write("\n")

    # Stream logging
    stream = logging.StreamHandler()
    streamfmt = logging.Formatter("%(asctime)s [%(levelname)s]\t%(message)s", datefmt="%H:%M:%S")
    
    stream.setFormatter(streamfmt)
    stream.setLevel(logging.INFO)
    logger.addHandler(stream)

    # File Logging
    filehandler = logging.FileHandler("requests.log")
    filefmt = logging.Formatter("%(asctime)s [%(levelname)s]\t%(message)s", datefmt="%d/%m/%Y %H:%M:%S")

    filehandler.setFormatter(filefmt)
    filehandler.setLevel(logging.DEBUG)
    logger.addHandler(filehandler)

    # Run website in background
    app.add_routes(routes)
    asyncio.ensure_future(web._run_app(app))
    
    # Run pinger
    loop = asyncio.get_event_loop()
    task = create_task(ping_task, PING_REPLS_DELAY)
    loop.run_until_complete(task)
