import logging
from aiohttp import web
from aiohttp import web_exceptions as errors

@web.middleware
async def on_error_middleware(request: web.Request, handler):
    """A middleware to log all http errors to my log"""
    try:
        return await handler(request)
    except errors.HTTPNotFound:
        return web.HTTPNotFound()
    except Exception as error:
        logger = logging.getLogger("pinger")
        logger.exception(error)
        return web.HTTPInternalServerError()


# Exported values
middlewares = [on_error_middleware]
