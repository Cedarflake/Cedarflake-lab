import atexit
import os
import signal
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from typing import Optional

from PIL import Image


class GifSpeedAdjuster:
    """GIF速度调整器的主类"""

    def __init__(self):
        self.input_path: Optional[str] = None
        self.output_path: Optional[str] = None
        self.target_duration: Optional[float] = None
        self.is_processing = False
        self.processing_thread: Optional[threading.Thread] = None
        self.should_cancel = False
        self._shutdown_initiated = False

        # 注册清理函数
        atexit.register(self._cleanup_on_exit)

        # 设置信号处理器
        self._setup_signal_handlers()

        self.setup_ui()

    def _setup_signal_handlers(self):
        """设置信号处理器"""

        def signal_handler(signum, frame):
            """处理系统信号"""
            print(f"\n接收到信号 {signum}，正在优雅关闭...")
            if hasattr(self, "root") and self.root:
                self.root.after(0, self._graceful_shutdown)

        # 设置SIGINT (Ctrl+C) 处理器
        try:
            signal.signal(signal.SIGINT, signal_handler)
            if hasattr(signal, "SIGTERM"):
                signal.signal(signal.SIGTERM, signal_handler)
        except (ValueError, OSError):
            # 在某些环境下可能无法设置信号处理器
            pass

    def _graceful_shutdown(self):
        """优雅关闭应用程序"""
        if self._shutdown_initiated:
            return

        self._shutdown_initiated = True

        if self.is_processing:
            print("正在取消处理任务...")
            self.should_cancel = True
            self.status_label.config(text="正在关闭...")

            # 等待处理线程结束
            if self.processing_thread and self.processing_thread.is_alive():
                self.processing_thread.join(timeout=2.0)

        self._cleanup_resources()

        try:
            self.root.quit()
        except Exception:
            pass

        try:
            self.root.destroy()
        except Exception:
            pass

    def _cleanup_resources(self):
        """清理资源"""
        try:
            # 清理临时文件
            if self.output_path and os.path.exists(self.output_path) and self.is_processing:
                try:
                    os.remove(self.output_path)
                    print(f"已清理临时文件: {self.output_path}")
                except Exception:
                    pass
        except Exception:
            pass

    def _cleanup_on_exit(self):
        """程序退出时的清理函数"""
        if not self._shutdown_initiated:
            self._cleanup_resources()

    def setup_ui(self):
        """初始化用户界面"""
        self.root = tk.Tk()
        self.root.title("GIF 速度调整器")
        self.root.geometry("520x450")
        self.root.resizable(False, False)

        # 设置关闭事件处理
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)

        # 设置样式
        style = ttk.Style()
        try:
            style.theme_use("vista")  # 使用更现代的主题
        except Exception:
            style.theme_use("default")

        # 配置强调按钮样式
        style.configure("Accent.TButton", font=("Arial", 10, "bold"), relief="raised")

        # 创建主框架
        main_frame = ttk.Frame(self.root, padding="20")
        main_frame.pack(fill=tk.BOTH, expand=True)

        # 输入文件选择部分
        input_frame = ttk.LabelFrame(main_frame, text="输入文件", padding="10")
        input_frame.pack(fill=tk.X, pady=(0, 10))

        ttk.Button(input_frame, text="选择 GIF 文件", command=self.select_input_file).pack(
            anchor=tk.W
        )
        self.input_label = ttk.Label(input_frame, text="未选择文件", foreground="gray")
        self.input_label.pack(anchor=tk.W, pady=(5, 0))

        # 速度设置部分
        speed_frame = ttk.LabelFrame(main_frame, text="速度设置", padding="10")
        speed_frame.pack(fill=tk.X, pady=(0, 10))

        ttk.Label(speed_frame, text="每帧持续时间(秒):").pack(anchor=tk.W)

        # 创建输入框架
        input_speed_frame = ttk.Frame(speed_frame)
        input_speed_frame.pack(fill=tk.X, pady=(5, 0))

        self.speed_var = tk.StringVar()
        self.speed_entry = ttk.Entry(input_speed_frame, textvariable=self.speed_var, width=15)
        self.speed_entry.pack(side=tk.LEFT)

        ttk.Button(input_speed_frame, text="预设值", command=self.show_preset_speeds).pack(
            side=tk.LEFT, padx=(10, 0)
        )

        self.speed_info = ttk.Label(
            speed_frame, text="提示: 0.05=快速, 0.1=正常, 0.5=慢速", foreground="blue"
        )
        self.speed_info.pack(anchor=tk.W, pady=(5, 0))

        # 输出文件选择部分
        output_frame = ttk.LabelFrame(main_frame, text="输出文件", padding="10")
        output_frame.pack(fill=tk.X, pady=(0, 10))

        ttk.Button(output_frame, text="选择保存位置", command=self.select_output_file).pack(
            anchor=tk.W
        )
        self.output_label = ttk.Label(output_frame, text="未选择保存位置", foreground="gray")
        self.output_label.pack(anchor=tk.W, pady=(5, 0))

        # 处理按钮和进度条
        process_frame = ttk.Frame(main_frame)
        process_frame.pack(fill=tk.X, pady=(20, 0))

        # 创建一个更突出的处理按钮
        button_frame = ttk.Frame(process_frame)
        button_frame.pack(pady=(0, 15))

        self.process_button = ttk.Button(
            button_frame,
            text="🎬 开始转换 GIF",
            command=self.start_processing,
            style="Accent.TButton",
        )
        self.process_button.pack(pady=5, ipadx=20, ipady=10)

        # 添加快捷键提示
        shortcut_label = ttk.Label(
            button_frame, text="按 Enter 键快速开始", foreground="gray", font=("Arial", 8)
        )
        shortcut_label.pack()

        self.progress = ttk.Progressbar(process_frame, mode="indeterminate")
        self.progress.pack(fill=tk.X, pady=(0, 5))

        self.status_label = ttk.Label(process_frame, text="准备就绪")
        self.status_label.pack()

        # 绑定快捷键
        self.root.bind("<Return>", lambda event: self.start_processing())
        self.root.bind("<KP_Enter>", lambda event: self.start_processing())
        self.root.bind("<Escape>", lambda event: self.cancel_processing())

        # 添加取消按钮
        self.cancel_button = ttk.Button(
            button_frame, text="❌ 取消处理", command=self.cancel_processing, state="disabled"
        )
        self.cancel_button.pack(pady=(5, 0))

    def select_input_file(self):
        """选择输入GIF文件"""
        file_path = filedialog.askopenfilename(
            title="选择 GIF 文件",
            filetypes=[("GIF files", "*.gif"), ("All files", "*.*")],
            parent=self.root,
        )

        if file_path:
            self.input_path = file_path
            filename = os.path.basename(file_path)
            self.input_label.config(text=f"已选择: {filename}", foreground="black")

            # 自动设置输出路径
            if not self.output_path:
                self.auto_set_output_path()

    def auto_set_output_path(self):
        """自动设置输出路径"""
        if self.input_path:
            dir_path = os.path.dirname(self.input_path)
            base_name = os.path.splitext(os.path.basename(self.input_path))[0]
            self.output_path = os.path.join(dir_path, f"{base_name}_adjusted.gif")

            filename = os.path.basename(self.output_path)
            self.output_label.config(text=f"将保存为: {filename}", foreground="black")

    def show_preset_speeds(self):
        """显示预设速度选项"""
        preset_window = tk.Toplevel(self.root)
        preset_window.title("预设速度")
        preset_window.geometry("300x200")
        preset_window.resizable(False, False)

        ttk.Label(preset_window, text="选择预设速度:", font=("Arial", 10, "bold")).pack(pady=10)

        presets = [("极快", 0.03), ("快速", 0.05), ("正常", 0.1), ("慢速", 0.3), ("极慢", 0.5)]

        for name, value in presets:
            btn = ttk.Button(
                preset_window,
                text=f"{name} ({value}秒)",
                command=lambda v=value: self.set_preset_speed(v, preset_window),
            )
            btn.pack(pady=2, padx=20, fill=tk.X)

    def set_preset_speed(self, value: float, window):
        """设置预设速度值"""
        self.speed_var.set(str(value))
        window.destroy()

    def select_output_file(self):
        """选择输出文件路径"""
        initial_file = ""
        if self.input_path:
            base_name = os.path.splitext(os.path.basename(self.input_path))[0]
            initial_file = f"{base_name}_adjusted.gif"

        file_path = filedialog.asksaveasfilename(
            title="保存 GIF 文件",
            defaultextension=".gif",
            initialfile=initial_file,  # 修复：使用 initialfile 而不是 initialname
            filetypes=[("GIF files", "*.gif"), ("All files", "*.*")],
            parent=self.root,
        )

        if file_path:
            self.output_path = file_path
            filename = os.path.basename(file_path)
            self.output_label.config(text=f"将保存为: {filename}", foreground="black")

    def validate_inputs(self) -> bool:
        """验证用户输入"""
        if not self.input_path:
            messagebox.showerror("错误", "请选择输入 GIF 文件", parent=self.root)
            return False

        if not os.path.exists(self.input_path):
            messagebox.showerror("错误", "输入文件不存在", parent=self.root)
            return False

        try:
            speed_text = self.speed_var.get().strip()
            if not speed_text:
                messagebox.showerror("错误", "请输入每帧持续时间", parent=self.root)
                return False

            self.target_duration = float(speed_text)
            if self.target_duration <= 0:
                messagebox.showerror("错误", "持续时间必须大于 0", parent=self.root)
                return False

            if self.target_duration > 10:
                result = messagebox.askyesno(
                    "确认",
                    f"持续时间 {self.target_duration} 秒较长，确定要继续吗？",
                    parent=self.root,
                )
                if not result:
                    return False

        except ValueError:
            messagebox.showerror("错误", "请输入有效的数字", parent=self.root)
            return False

        if not self.output_path:
            messagebox.showerror("错误", "请选择保存位置", parent=self.root)
            return False

        return True

    def start_processing(self):
        """开始处理GIF（在新线程中）"""
        if not self.validate_inputs():
            return

        if self.is_processing:
            messagebox.showwarning("警告", "正在处理中，请等待完成或取消当前操作", parent=self.root)
            return

        self.is_processing = True
        self.should_cancel = False
        self.process_button.config(state="disabled")
        self.cancel_button.config(state="normal")
        self.progress.start()
        self.status_label.config(text="正在处理...")

        # 在新线程中处理，避免界面冻结
        self.processing_thread = threading.Thread(target=self.process_gif)
        self.processing_thread.daemon = True
        self.processing_thread.start()

    def process_gif(self):
        """处理GIF文件"""
        try:
            self.adjust_gif_speed(self.input_path, self.output_path, self.target_duration)

            if not self.should_cancel:
                # 在主线程中更新UI
                self.root.after(0, self.processing_completed, True, "处理完成！")
            else:
                self.root.after(0, self.processing_completed, False, "操作已取消")

        except Exception as e:
            if not self.should_cancel:
                error_msg = f"处理失败: {str(e)}"
                self.root.after(0, self.processing_completed, False, error_msg)
            else:
                self.root.after(0, self.processing_completed, False, "操作已取消")

    def processing_completed(self, success: bool, message: str):
        """处理完成后的UI更新"""
        self.is_processing = False
        self.should_cancel = False
        self.progress.stop()
        self.process_button.config(state="normal")
        self.cancel_button.config(state="disabled")

        if success:
            self.status_label.config(text="处理完成")
            messagebox.showinfo("成功", message, parent=self.root)
        else:
            if "取消" in message:
                self.status_label.config(text="已取消")
            else:
                self.status_label.config(text="处理失败")
            if "取消" not in message:  # 只有在非取消情况下才显示错误
                messagebox.showerror("错误", message, parent=self.root)

    def adjust_gif_speed(self, input_path: str, output_path: str, target_duration: float):
        """调整GIF速度的核心方法"""
        temp_output_path = None
        try:
            # 使用临时文件避免覆盖原文件
            temp_output_path = output_path + ".tmp"

            with Image.open(input_path) as im:
                if not hasattr(im, "n_frames") or im.n_frames <= 1:
                    raise ValueError("输入文件不是有效的动画GIF")

                frames = []
                durations = []
                target_duration_ms = max(10, int(target_duration * 1000))

                print(f"处理 {im.n_frames} 帧，目标持续时间: {target_duration_ms}ms")

                # 获取原始GIF的基本信息
                original_mode = im.mode
                original_size = im.size
                transparency = im.info.get("transparency")

                # 提取和处理所有帧
                for i in range(im.n_frames):
                    # 检查是否需要取消
                    if self.should_cancel:
                        raise InterruptedError("用户取消操作")

                    im.seek(i)

                    # 更新状态
                    if not self.should_cancel:
                        progress_text = f"正在处理第 {i + 1}/{im.n_frames} 帧..."
                        self.root.after(
                            0, lambda text=progress_text: self.status_label.config(text=text)
                        )

                    # 获取当前帧的信息
                    current_frame = im.copy()
                    disposal = im.disposal_method if hasattr(im, "disposal_method") else 0

                    # 转换为RGBA模式进行处理
                    if current_frame.mode != "RGBA":
                        if current_frame.mode == "P":
                            # 处理调色板模式
                            if transparency is not None:
                                current_frame = current_frame.convert("RGBA")
                            else:
                                current_frame = current_frame.convert("RGB").convert("RGBA")
                        else:
                            current_frame = current_frame.convert("RGBA")

                    # 确保帧大小一致
                    if current_frame.size != original_size:
                        # 创建背景并粘贴帧
                        background = Image.new("RGBA", original_size, (255, 255, 255, 0))
                        background.paste(current_frame, (0, 0))
                        current_frame = background

                    # 根据原始disposal方法处理帧
                    if i == 0:
                        # 第一帧作为基础
                        processed_frame = current_frame.copy()
                    else:
                        # 处理后续帧
                        if disposal == 1:  # 不处置（保留前一帧）
                            # 在前一帧基础上叠加当前帧
                            processed_frame = frames[-1].copy()
                            processed_frame.paste(current_frame, (0, 0), current_frame)
                        elif disposal == 2:  # 恢复到背景色
                            # 使用当前帧，不叠加
                            processed_frame = current_frame.copy()
                        else:  # disposal == 0 或其他，默认处理
                            # 使用当前帧
                            processed_frame = current_frame.copy()

                    # 转换回合适的模式进行保存
                    if original_mode == "P":
                        # 转换回调色板模式
                        processed_frame = processed_frame.convert("RGB").convert(
                            "P", palette=Image.ADAPTIVE
                        )
                        if transparency is not None:
                            # 重新设置透明色
                            processed_frame.info["transparency"] = 0
                    elif original_mode in ("L", "RGB"):
                        processed_frame = processed_frame.convert(original_mode)

                    frames.append(processed_frame)
                    durations.append(target_duration_ms)

                # 最后检查一次是否取消
                if self.should_cancel:
                    raise InterruptedError("用户取消操作")

                # 更新状态
                if not self.should_cancel:
                    self.root.after(0, lambda: self.status_label.config(text="正在保存文件..."))

                # 保存到临时文件
                save_kwargs = {
                    "save_all": True,
                    "append_images": frames[1:] if len(frames) > 1 else [],
                    "duration": durations,
                    "loop": 0,
                    "optimize": False,
                    "disposal": 2,
                }

                if transparency is not None and original_mode == "P":
                    save_kwargs["transparency"] = 0
                    save_kwargs["palette"] = frames[0].palette

                frames[0].save(temp_output_path, **save_kwargs)

                # 检查是否被取消
                if self.should_cancel:
                    raise InterruptedError("用户取消操作")

                # 移动临时文件到最终位置
                if os.path.exists(output_path):
                    os.remove(output_path)
                os.rename(temp_output_path, output_path)
                temp_output_path = None  # 成功移动后，不需要清理临时文件

        except InterruptedError:
            # 用户取消，清理临时文件
            if temp_output_path and os.path.exists(temp_output_path):
                try:
                    os.remove(temp_output_path)
                except Exception:
                    pass
            raise InterruptedError("用户取消操作")
        except Exception as e:
            # 其他错误，清理临时文件
            if temp_output_path and os.path.exists(temp_output_path):
                try:
                    os.remove(temp_output_path)
                except Exception:
                    pass
            raise e
        finally:
            # 确保清理临时文件
            if temp_output_path and os.path.exists(temp_output_path):
                try:
                    os.remove(temp_output_path)
                except Exception:
                    pass

    def on_closing(self):
        """处理窗口关闭事件"""
        if self._shutdown_initiated:
            return

        if self.is_processing:
            result = messagebox.askyesno(
                "确认退出", "正在处理文件中，确定要退出吗？\n退出将取消当前操作。", parent=self.root
            )
            if not result:
                return

            # 取消处理并等待
            self.should_cancel = True
            self.status_label.config(text="正在关闭...")

            # 给处理线程一些时间完成清理
            self.root.after(100, self._force_close)
        else:
            self._graceful_shutdown()

    def _force_close(self):
        """强制关闭应用程序"""
        if self.processing_thread and self.processing_thread.is_alive():
            # 再等待一小段时间
            self.processing_thread.join(timeout=1.0)

        self._graceful_shutdown()

    def cancel_processing(self):
        """取消正在进行的处理"""
        if self.is_processing and not self.should_cancel:
            self.should_cancel = True
            self.status_label.config(text="正在取消...")
            self.cancel_button.config(state="disabled")

    def run(self):
        """运行应用程序"""
        try:
            self.root.mainloop()
        except KeyboardInterrupt:
            print("\n接收到键盘中断，正在优雅关闭...")
            self._graceful_shutdown()
        except Exception as e:
            print(f"应用程序发生错误: {e}")
            self._graceful_shutdown()
        finally:
            # 确保程序能够退出
            try:
                sys.exit(0)
            except SystemExit:
                os._exit(0)


def main():
    """主函数"""
    try:
        app = GifSpeedAdjuster()
        app.run()
    except KeyboardInterrupt:
        print("\n程序被用户中断")
    except Exception as e:
        print(f"程序发生错误: {e}")
    finally:
        print("程序结束")


if __name__ == "__main__":
    main()
