//! Extractive summary: picks the most informative sentences of a text and keeps them in order.
//! No model is involved, so it is instant and works offline; it selects sentences, it does not rewrite them.

use std::collections::HashMap;

const STOPWORDS: &[&str] = &[
    // English
    "the", "and", "for", "are", "but", "not", "you", "all", "any", "can", "had", "her", "was", "one", "our", "out",
    "has", "have", "that", "this", "with", "from", "they", "will", "would", "there", "their", "what", "about",
    "which", "when", "your", "been", "were", "than", "then", "them", "into", "also", "more", "such", "its",
    // Vietnamese
    "và", "của", "là", "có", "cho", "các", "những", "một", "được", "trong", "với", "này", "để", "không", "khi",
    "đã", "cũng", "như", "từ", "người", "theo", "về", "tại", "ra", "nhiều", "rất", "sẽ", "đó", "thì", "mà",
    "hay", "nên", "bị", "vào", "lại", "còn", "do", "nếu", "vì", "nhưng", "các", "đến", "trên", "sau", "đang",
];

fn words(sentence: &str) -> impl Iterator<Item = String> + '_ {
    sentence
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.chars().count() >= 3 || w.chars().any(|c| !c.is_ascii()))
        .map(str::to_lowercase)
        .filter(|w| !STOPWORDS.contains(&w.as_str()))
}

/// Splits on sentence punctuation and blank lines.
pub fn sentences(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let flush = |current: &mut String, out: &mut Vec<String>| {
        let s = current.split_whitespace().collect::<Vec<_>>().join(" ");
        if s.chars().filter(|c| c.is_alphanumeric()).count() >= 12 {
            out.push(s);
        }
        current.clear();
    };
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        current.push(c);
        let next = chars.get(i + 1).copied();
        let ends = matches!(c, '.' | '!' | '?' | '…' | '。')
            && next.map_or(true, |n| n.is_whitespace())
            // not a decimal like "3.5" or an abbreviation such as "Mr."
            && !(c == '.' && current.trim_end_matches('.').chars().last().is_some_and(|p| p.is_ascii_digit()) && next.is_some_and(|n| n.is_ascii_digit()));
        let blank_line = c == '\n' && next == Some('\n');
        if ends || blank_line {
            flush(&mut current, &mut out);
        }
        i += 1;
    }
    flush(&mut current, &mut out);
    out
}

/// The summary: about 15 % of the sentences, at least 3 and at most `max` (default 10).
pub fn summarize(text: &str, max: Option<usize>) -> String {
    let all = sentences(text);
    let cap = max.unwrap_or(10).max(1);
    let want = ((all.len() as f64 * 0.15).round() as usize).clamp(3, cap);
    if all.len() <= want {
        return all.join("\n\n");
    }
    let mut freq: HashMap<String, f64> = HashMap::new();
    for s in &all {
        for w in words(s) {
            *freq.entry(w).or_default() += 1.0;
        }
    }
    let total = all.len() as f64;
    let mut scored: Vec<(usize, f64)> = all
        .iter()
        .enumerate()
        .map(|(i, s)| {
            let ws: Vec<String> = words(s).collect();
            if ws.is_empty() {
                return (i, 0.0);
            }
            let sum: f64 = ws.iter().map(|w| freq[w]).sum();
            // average importance, mild preference for sentences that are neither tiny nor huge, and for the opening
            let length_factor = 1.0 / (1.0 + ((ws.len() as f64) - 18.0).abs() / 30.0);
            let position = 1.0 + 0.35 * (1.0 - i as f64 / total);
            (i, sum / ws.len() as f64 * length_factor * position)
        })
        .collect();
    scored.sort_by(|a, b| b.1.total_cmp(&a.1));
    let mut chosen: Vec<usize> = scored.into_iter().take(want).map(|(i, _)| i).collect();
    chosen.sort_unstable();
    chosen.iter().map(|i| all[*i].clone()).collect::<Vec<_>>().join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_sentences_and_keeps_decimals() {
        let s = sentences("Pi is about 3.14 in value. The second sentence is here! And a third one follows?");
        assert_eq!(s.len(), 3, "{s:?}");
        assert!(s[0].contains("3.14"));
    }

    #[test]
    fn picks_central_sentences_in_original_order() {
        let text = "Tangelo converts files on your own computer. It never uploads anything to a server. \
            The weather was pleasant yesterday afternoon in the city. Files are converted locally by Tangelo and stay on your computer. \
            A random remark about lunch appeared in the notes. Tangelo also compresses video and images to a chosen size. \
            Another unrelated sentence mentions a football match last night. Local conversion keeps your files private on your computer. \
            Someone wrote about gardening tomatoes this summer. The wheel in Tangelo opens when you drag files. \
            Yet another aside about traffic on the highway today. Tangelo runs on Windows and works offline for files. \
            Nobody remembers the colour of the curtains in the old office. Compression in Tangelo can target an exact size for files.";
        let summary = summarize(text, Some(4));
        assert!(summary.matches("Tangelo").count() >= 3, "{summary}");
        assert!(!summary.contains("curtains") && !summary.contains("football"), "{summary}");
        let parts: Vec<&str> = summary.split("\n\n").collect();
        assert!((3..=4).contains(&parts.len()), "{} sentences", parts.len());
    }

    #[test]
    fn works_for_vietnamese() {
        let text = "Tangelo là ứng dụng chuyển đổi file chạy trên máy tính của bạn. Mọi file đều được xử lý ngay trên máy và không tải lên máy chủ. \
            Hôm qua trời nắng đẹp ở thành phố khi tôi đi dạo quanh hồ. Ứng dụng Tangelo hỗ trợ nén video và ảnh theo dung lượng mong muốn. \
            Một câu không liên quan nói về trận bóng đá tối qua tại sân vận động. Bánh xe của Tangelo hiện ra khi bạn kéo file vào. \
            Có người kể về việc trồng cà chua trong vườn nhà vào mùa hè. Tangelo chuyển đổi ảnh, video, âm thanh và tài liệu rất nhanh trên máy.";
        let summary = summarize(text, Some(3));
        assert!(summary.contains("Tangelo"));
        assert!(!summary.contains("cà chua"));
    }

    #[test]
    fn short_texts_are_returned_whole() {
        let t = "A short text with one sentence only here.";
        assert_eq!(summarize(t, None), t);
    }
}

