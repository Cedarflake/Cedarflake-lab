from __future__ import annotations

from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile


class CaptchaPromptError(RuntimeError):
    pass


class CaptchaUiUnavailable(CaptchaPromptError):
    pass


async def prompt_captcha(image_bytes: bytes, content_type: str) -> str:
    try:
        return _show_native_dialog(image_bytes)
    except CaptchaUiUnavailable:
        return _prompt_from_temporary_file(image_bytes, content_type)


def _show_native_dialog(image_bytes: bytes) -> str:
    try:
        import tkinter as tk

        from PIL import Image, ImageTk, UnidentifiedImageError
    except ImportError as error:
        raise CaptchaUiUnavailable("本机缺少原生验证码窗口依赖") from error

    try:
        with Image.open(BytesIO(image_bytes)) as source:
            source.load()
            captcha_image = source.convert("RGB")
    except (OSError, UnidentifiedImageError) as error:
        raise CaptchaPromptError("门户返回的验证码不是有效图片") from error

    max_width = 640
    max_height = 320
    captcha_image.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)

    try:
        window = tk.Tk()
    except tk.TclError as error:
        raise CaptchaUiUnavailable("无法创建原生验证码窗口") from error

    result = {"code": ""}
    window.title("校园网图形验证码")
    window.resizable(False, False)

    photo = ImageTk.PhotoImage(captcha_image, master=window)
    tk.Label(window, image=photo).pack(padx=16, pady=(16, 8))
    tk.Label(window, text="请输入图片中的验证码").pack(padx=16)

    code_entry = tk.Entry(window, width=24, justify="center")
    code_entry.pack(padx=16, pady=8)

    def submit() -> None:
        code = code_entry.get().strip()
        if code:
            result["code"] = code
            window.quit()

    def cancel() -> None:
        window.quit()

    button_row = tk.Frame(window)
    button_row.pack(padx=16, pady=(0, 16))
    tk.Button(button_row, text="提交", width=10, command=submit).pack(side=tk.LEFT, padx=4)
    tk.Button(button_row, text="取消", width=10, command=cancel).pack(side=tk.LEFT, padx=4)

    window.bind("<Return>", lambda _event: submit())
    window.protocol("WM_DELETE_WINDOW", cancel)
    code_entry.focus_force()
    window.lift()
    window.mainloop()
    window.destroy()
    return result["code"]


def _prompt_from_temporary_file(image_bytes: bytes, content_type: str) -> str:
    suffixes = {
        "image/gif": ".gif",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }
    suffix = suffixes.get(content_type.casefold(), ".img")
    with NamedTemporaryFile(prefix="campus-net-captcha-", suffix=suffix, delete=False) as file:
        file.write(image_bytes)
        image_path = Path(file.name)
    try:
        return input(f"请查看验证码图片 {image_path}，输入验证码（直接回车取消）：").strip()
    finally:
        image_path.unlink(missing_ok=True)
