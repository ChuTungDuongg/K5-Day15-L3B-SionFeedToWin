"""Phân tích thời gian chờ Kilimanjaro Safaris. Nguồn: TouringPlans.com."""
import csv
import io
from collections import defaultdict
from urllib.request import urlopen

SOURCE = ("https://raw.githubusercontent.com/TouringPlans/DisneyAnimalKingdomWaitTimes/"
          "933161b8bebb7cd50e0d54bcb3578484875487fa/AK07.csv")


def paired_waits(rows):
    # Một quan sát/mốc giờ. Loại mốc có giá trị mâu thuẫn, thiếu hoặc trò đóng cửa.
    slots = defaultdict(lambda: (set(), set()))
    for row in rows:
        stamp = row["datetime"]
        if stamp.startswith("2018-"):
            for values, field in zip(slots[stamp], ("SPOSTMIN", "SACTMIN")):
                if row[field].strip():
                    values.add(int(row[field]))
    for stamp, (posted, actual) in sorted(slots.items()):
        if len(posted) == len(actual) == 1 and min(posted) >= 0 and min(actual) >= 0:
            yield stamp, min(posted), min(actual)


if __name__ == "__main__":
    with urlopen(SOURCE, timeout=60) as response:
        pairs = list(paired_waits(csv.DictReader(io.TextIOWrapper(response, encoding="utf8"))))
    overruns = [p for p in pairs if p[2] - p[1] >= 10]
    print(f"{len(overruns)}/{len(pairs)} ({100 * len(overruns) / len(pairs):.1f}%)")
    for stamp, posted, actual in overruns[:5]:
        print(f"| {stamp} | {posted} | {actual} | +{actual - posted} |")
