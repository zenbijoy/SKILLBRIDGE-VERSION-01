import os
import glob

sql_files = sorted(glob.glob("*.sql"))
with open("merged.txt", "w", encoding="utf-8") as out:
    for f in sql_files:
        if f == "merged.txt": continue
        out.write(f"-- {f}\n")
        with open(f, "r", encoding="utf-8") as infile:
            out.write(infile.read())
        out.write("\n\n")
