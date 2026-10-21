//! Background removal: runs a U²-Net style ONNX model (silueta) through ONNX Runtime.
//! ffmpeg does the decoding and the final alpha merge; this module only turns a 320×320 RGB frame
//! into a 320×320 mask.

use ort::session::Session;
use ort::value::Tensor;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

pub const SIZE: usize = 320;

struct Loaded {
    session: Session,
    input_name: String,
}

static MODEL: OnceLock<Result<Mutex<Loaded>, String>> = OnceLock::new();

fn load(dll: &Path, model: &Path) -> &'static Result<Mutex<Loaded>, String> {
    MODEL.get_or_init(|| {
        let env = ort::init_from(dll)
            .map_err(|e| format!("Cannot load ONNX Runtime: {e}"))?
            .build()
            .map_err(|e| format!("Cannot start ONNX Runtime: {e}"))?;
        let session = Session::builder(&env)
            .map_err(|e| e.to_string())?
            .commit_from_file(model)
            .map_err(|e| format!("Cannot load the model: {e}"))?;
        let input_name = session.inputs().first().map(|i| i.name().to_string()).ok_or("The model has no input")?;
        Ok(Mutex::new(Loaded { session, input_name }))
    })
}

/// `rgb`: SIZE×SIZE×3 bytes (row-major, RGB). Returns SIZE×SIZE mask bytes, 255 = keep.
pub fn mask(dll: &Path, model: &Path, rgb: &[u8]) -> Result<Vec<u8>, String> {
    if rgb.len() != SIZE * SIZE * 3 {
        return Err("Unexpected frame size".into());
    }
    let loaded = load(dll, model).as_ref().map_err(|e| e.clone())?;
    let mut loaded = loaded.lock().unwrap_or_else(|e| e.into_inner());

    // Same preprocessing as rembg: scale by the brightest value, then ImageNet mean/std, planar CHW.
    let max = rgb.iter().copied().max().unwrap_or(255).max(1) as f32;
    let mean = [0.485_f32, 0.456, 0.406];
    let std = [0.229_f32, 0.224, 0.225];
    let plane = SIZE * SIZE;
    let mut input = vec![0f32; 3 * plane];
    for (i, px) in rgb.chunks_exact(3).enumerate() {
        for c in 0..3 {
            input[c * plane + i] = (px[c] as f32 / max - mean[c]) / std[c];
        }
    }
    let tensor = Tensor::from_array(([1usize, 3, SIZE, SIZE], input)).map_err(|e| e.to_string())?;
    let name = loaded.input_name.clone();
    let outputs = loaded.session.run(ort::inputs![name => tensor]).map_err(|e| format!("Model run failed: {e}"))?;
    let (_, data) = outputs[0].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
    if data.len() < plane {
        return Err("The model returned an unexpected result".into());
    }
    let pred = &data[..plane];
    let (lo, hi) = pred.iter().fold((f32::MAX, f32::MIN), |(lo, hi), v| (lo.min(*v), hi.max(*v)));
    let span = (hi - lo).max(1e-6);
    Ok(pred.iter().map(|v| (((v - lo) / span) * 255.0).round().clamp(0.0, 255.0) as u8).collect())
}

/// Writes a binary PGM that ffmpeg can read as a grey image.
pub fn write_pgm(path: &Path, mask: &[u8]) -> Result<(), String> {
    let mut data = format!("P5\n{SIZE} {SIZE}\n255\n").into_bytes();
    data.extend_from_slice(mask);
    std::fs::write(path, data).map_err(|e| e.to_string())
}
