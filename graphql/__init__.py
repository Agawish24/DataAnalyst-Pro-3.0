import os
import json
import aiohttp
import asyncio
import logging

async def get_keepalive_repls():
    logger = logging.getLogger("pinger")
    sess = aiohttp.ClientSession()
    username = os.environ["REPL_OWNER"] or "chocolatejade42"
    
    # Doesn't work without these headers for some reason
    slug = os.environ["REPL_SLUG"] or "keepalive"
    sess.headers.update({
        "referer": "https://replit.com/@{}/{}".format(username, slug),
        "X-Requested-With": "ReplTalk", # TODO
    })

    # Main processing
    try:
        rawsoup = await fetch_repls(sess, username)
    except asyncio.TimeoutError:
        logger.warning("Replit API call timed out after ten seconds. Attempting to use cache data")
        rawsoup = await attempt_fetch_saved_data()
    finally:
        targeturls = await process_repls(rawsoup)

    # Close session
    await sess.close()

    # Return repl URLs
    logger.info(f"Found {len(targeturls)} repls: " + ", ".join(targeturls.keys()))
    return targeturls

async def fetch_repls(sess: aiohttp.ClientSession, username: str) -> list:
    logger = logging.getLogger("pinger")

    # Setup the GraphQL request
    with open("graphql/query.gql") as fp:
        query = fp.read()

    request = {
        "operationName": "getUserRepls",
        "query": query,
        "variables": {
            "count": 100, # Number of result per page
            "username": username,
        }
    }

    data = []
    cursor = ""

    # Paginate through until all the repls have been sourced
    while cursor != None:
        # Make the request with new cursor and parse response
        request["variables"].update({"cursor": cursor})
        async with sess.post("https://replit.com/graphql", json=request, timeout=10) as resp:
            text = (await resp.read()).decode()

            if not resp.ok:
                logger.warning(f"Replit returned {resp.status}: {text[:100]!r}. Attempting to use cache data")
                return await attempt_fetch_saved_data()
            
            parsed = await resp.json()
            soup = parsed.get("data")

        # Raise any errors
        if (error := parsed.get("errors")):
            raise ValueError(error)
        
        # Check if this repl is being run in an embed
        if not soup["user"]: # User not logged in
            print()
            print("No data returned from the Replit API.")
            print("Make sure to log in to try yourself!")
            print()
            exit(0)
        if not soup["user"]["repls"]["items"]: # No public repls
            print()
            print(f"Couldn't find any repls for user {username}.")
            print("Make sure any repls are public and have been")
            print("renamed from the default repl name. The keyword")
            print("\"keepalive\" should also be included in the repl description.")
            print()
            exit(0)
                
        # Add extracted data to the dump
        data.extend(soup["user"]["repls"]["items"])

        # Determine if more pagination is required
        # cursor = None # Return first page results only
        info = soup["user"]["repls"]["pageInfo"]
        cursor = info["nextCursor"] if info["hasNextPage"] else None

    # Save into a cache for if we et 429'd later
    with open("repls.json", "w") as fp:
        pretty = json.dumps(data, indent=2)
        fp.write(pretty)

    return data

async def process_repls(data: list) -> dict:
    servers = [repl for repl in data if repl["config"]["isServer"]]
    targets = [repl for repl in servers if "keepalive" in str(repl["description"])]
    targeturls = {repl["slug"]: repl["hostedUrl"] for repl in targets}

    return targeturls

async def attempt_fetch_saved_data() -> dict:
    logger = logging.getLogger("pinger")

    if not os.path.exists("repls.json"):
        logger.error("Cached file doesn't exist. Unable to continue with no data")
        return dict()

    with open("repls.json") as fp:
        logger.info("Found cached data to use instead")
        return json.loads(fp.read())
