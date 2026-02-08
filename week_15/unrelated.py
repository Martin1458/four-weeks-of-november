
# 0-26
def get_lecture_link(n):
    base_url = "https://iccl.inf.tu-dresden.de/w/images/1/12/FS2025-Vorlesung-"
    return f"{base_url}{n:02d}-print.pdf"

# 0-14
def get_exercise_link(n):
    base_url = "https://iccl.inf.tu-dresden.de/w/images/a/a1/FS2025-Blatt-"
    return f"{base_url}{n:02d}.pdf"

# copy all links to clipboard one by one
if __name__ == "__main__":
    import pyperclip
    import time

    lecture_links = [get_lecture_link(i) for i in range(27)]
    exercise_links = [get_exercise_link(i) for i in range(15)]

    all_links = lecture_links + exercise_links
    for link in all_links:
        pyperclip.copy(link)
        print(f"Copied to clipboard: {link}")
        time.sleep(1)