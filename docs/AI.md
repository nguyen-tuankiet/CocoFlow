# Offline AI add-on

The AI tools ship inside the installer and the portable zip (`installer-bin\ai\` is copied to `bin\ai\`), so there is
nothing extra to install. Cocoflow finds them automatically; they appear in the **AI** wheel (Ctrl+Alt while dragging)
and in the AI tab of the main window. Only LibreOffice is still a separate add-on zip.

| Tool | What it does | Engine |
|---|---|---|
| Text (OCR), Searchable PDF | Reads text from pictures and scanned PDFs, Vietnamese and English | Tesseract 5.4 + `vie`/`eng` data (tessdata_best) |
| Subtitles, Summary of speech | Speech to SRT / VTT / TXT in many languages, optional translation to English | whisper.cpp + `ggml-small-q5_1.bin` |
| Remove background | PNG with transparent background | ONNX Runtime + `silueta.onnx` (U²-Net) |
| Upscale ×2 / ×4 | Sharper, larger pictures | Real-ESRGAN ncnn (Vulkan) + `realesrgan-x4plus` |
| Summary | Key sentences of a document, PDF or scan | Built in (extractive, no model) |

Everything runs on the PC. Nothing is uploaded.

## Layout of `bin\ai\`

```
ai\
  tesseract\   tesseract.exe, DLLs, tessdata\ (eng, vie, configs, pdf.ttf)
  whisper\     whisper-cli.exe, whisper*.dll, ggml*.dll
  models\      ggml-small-q5_1.bin (speech), silueta.onnx (background)
  onnxruntime\ onnxruntime.dll (+ onnxruntime_providers_shared.dll)
  realesrgan\  realesrgan-ncnn-vulkan.exe, vcomp140.dll, models\realesrgan-x4plus.{bin,param}
```

A different speech model works too: put any `ggml-*.bin` file in `models\` (for example `ggml-medium-q5_0.bin` for
better accuracy at the cost of speed).

## Sources and licences

| Part | Source | Licence |
|---|---|---|
| Tesseract | https://github.com/UB-Mannheim/tesseract (Windows build 5.4.0) | Apache-2.0 |
| tessdata_best `vie`, `eng` | https://github.com/tesseract-ocr/tessdata_best | Apache-2.0 |
| whisper.cpp binaries | https://github.com/ggml-org/whisper.cpp/releases (`whisper-bin-x64.zip`) | MIT |
| Whisper `ggml-small-q5_1.bin` | https://huggingface.co/ggerganov/whisper.cpp | MIT |
| ONNX Runtime 1.31 | https://github.com/microsoft/onnxruntime/releases | MIT |
| `silueta.onnx` | https://github.com/danielgatis/rembg/releases/tag/v0.0.0 | MIT / Apache-2.0 (U²-Net) |
| Real-ESRGAN ncnn Vulkan | https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0 (20220424 build) | BSD-3-Clause |

## Notes

- Speech recognition runs on the CPU: expect roughly real-time speed on a laptop; long files show progress in Activity.
- Upscaling needs a Vulkan-capable graphics driver (any recent GPU or integrated graphics).
- The AI tools cannot open paths with accented characters, so Cocoflow reaches them through a folder link under
  `%ProgramData%\Cocoflow\links` and keeps its scratch files in an ASCII folder. This is automatic.
