with open("mods.txt", "r") as mods:
    for line in mods.readlines():
        if line.startswith("#") or line.strip() == "":
            continue

        print(line)
        mod_id = input("id: ")
        if mod_id == "":
            continue

        description = input("description: ")
        state = input("state: ")

        split = line.split(" ")
        date = split.pop()
        name = " ".join(split)

        icon = input("icon: ")
        preview = input("preview: ")

        with open(f"mods/{mod_id}.md", "w") as mod_markdown:
            mod_markdown.write(f"""
<!--{{
    "name": "{name}",
    "description": "{description}",
    "state": "{state}",
    "date": "{date}",
    "icon": "{icon}",
    "preview": "{preview}"
}}-->

# {name}

Page has yet to be written...

""".strip() + "\n")
