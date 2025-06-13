"""
    A file to check the delay between pings and ensure
    the app is running smoothly and properly
"""

import requests
import matplotlib.pyplot as plt
from datetime import datetime, timedelta

# Variables
dates = []
delays = {}
formatstr = "%d/%m/%Y %H:%M:%S"
filterafter = datetime.now() - timedelta(hours=24)

# Fetch data
resp = requests.get("https://keepalive.chocolatejade42.repl.co/requests.log")
soup = filter(lambda l: "preparing" in l.lower(), resp.text.split("\n"))

# Processing fetched data
for line in soup:
    if not line:
        continue
    
    date = datetime.strptime(line.split(" [", 1)[0], formatstr)
    dates.append(date)

for index, item in enumerate(dates):
    if index == 0:
        continue
    if item < filterafter:
        continue

    strp = item.strftime(formatstr)
    delta = abs(item - dates[index - 1])
    delay = int(delta.total_seconds())
    
    delays[strp] = delay

# Add current
now = datetime.now()
delays[now.strftime(formatstr)] = 3

# Plot values
# plt.figure(figsize=(15, 7.5))
plt.plot(
    delays.keys(), delays.values(),
    linestyle="dashed", color="#202225", markerfacecolor="#7289da",
    marker="o", linewidth=3, markersize=12,
)

plt.xlabel("Datetime")
plt.ylabel("Seconds since last ping")
plt.title("Distribution of pings")

# Any points above the average line represent downtime
# when the repl was inactive (for some reason).
# Any points below the average line represent where the
# repl has been restarted prematurely due to me working on it.
plt.show()
