import { LogoutOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Input, Segmented, Spin } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { REPO } from "../release";

type Row = { key: string; count: number };
type Day = { day: string; views: number; visitors: number; downloads: number; setup: number; full: number };
type Stats = {
  days: number;
  series: Day[];
  totals: { views: number; visitors: number; clicks: number };
  allTime: { views: number; setup: number; full: number };
  countries: Row[];
  referrers: Row[];
  devices: Row[];
};
type Release = { tag: string; date: string; setup: number; full: number };

const KEY = "cocoflow-admin-key";
const nf = new Intl.NumberFormat("vi-VN");
const regions = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["vi"], { type: "region" }) : null;

const countryName = (code: string) => {
  if (code === "??") return "Không rõ";
  try {
    return regions?.of(code) ?? code;
  } catch {
    return code;
  }
};
const refName = (r: string) => (r === "direct" ? "Truy cập trực tiếp" : r);
const deviceName = (d: string) => ({ windows: "Windows", mobile: "Điện thoại", other: "Khác (Mac, Linux…)" })[d] ?? d;
const short = (day: string) => day.slice(8) + "/" + day.slice(5, 7);

async function fetchStats(key: string, days: number): Promise<Stats> {
  const r = await fetch(`/api/stats?days=${days}`, { headers: { "x-admin-key": key } });
  if (r.status === 401) throw new Error("Sai mật khẩu.");
  if (r.status === 429) throw new Error("Nhập sai quá nhiều lần. Thử lại sau 15 phút.");
  if (!r.ok) throw new Error("Không lấy được số liệu. Kiểm tra database Redis đã Connect vào project và đã Redeploy.");
  return r.json();
}

// Real installer downloads, counted by GitHub itself (tools-v1 and other pre-releases are left out).
async function fetchReleases(): Promise<Release[]> {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=40`, { headers: { Accept: "application/vnd.github+json" } });
  if (!r.ok) throw new Error("github");
  const list = (await r.json()) as { tag_name: string; published_at: string; prerelease: boolean; draft: boolean; assets: { name: string; download_count: number }[] }[];
  return list
    .filter((x) => !x.prerelease && !x.draft)
    .map((x) => ({
      tag: x.tag_name,
      date: x.published_at.slice(0, 10),
      setup: x.assets.find((a) => /setup\.exe$/i.test(a.name) && !/full/i.test(a.name))?.download_count ?? 0,
      full: x.assets.find((a) => /full-setup\.exe$/i.test(a.name))?.download_count ?? 0,
    }));
}

function Bars({ series, pick, tint }: { series: Day[]; pick: (d: Day) => { back?: number; front: number }; tint: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 150;
  const max = Math.max(1, ...series.map((d) => Math.max(pick(d).back ?? 0, pick(d).front)));
  const slot = W / series.length;
  const bw = Math.max(2, slot * 0.7);
  const y = (n: number) => H - (n / max) * (H - 6);
  const hd = hover === null ? null : series[hover];
  return (
    <div>
      <div className="ad-read">
        {hd ? `${hd.day}: ${nf.format(pick(hd).front)}${pick(hd).back !== undefined ? ` · ${nf.format(pick(hd).back!)} lượt xem` : ""}` : `Cao nhất ${nf.format(max)} mỗi ngày`}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 2}`} width="100%" role="img" onMouseLeave={() => setHover(null)}>
        {series.map((d, i) => {
          const v = pick(d);
          const x = i * slot + (slot - bw) / 2;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)}>
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              {v.back !== undefined && <rect x={x} y={y(v.back)} width={bw} height={H - y(v.back)} rx={2} fill={tint} opacity={0.28} />}
              <rect x={x} y={y(v.front)} width={bw} height={H - y(v.front)} rx={2} fill={tint} opacity={hover === i ? 1 : 0.9} />
            </g>
          );
        })}
        <line x1={0} x2={W} y1={H} y2={H} stroke="#e5e7eb" />
      </svg>
      <div className="ad-axis">
        {[0, Math.floor(series.length / 2), series.length - 1].map((i) => (
          <span key={i}>{short(series[i].day)}</span>
        ))}
      </div>
    </div>
  );
}

function Rows({ rows, label }: { rows: Row[]; label: (k: string) => string }) {
  if (!rows.length) return <div className="ad-empty">Chưa có dữ liệu.</div>;
  const total = rows.reduce((a, r) => a + r.count, 0) || 1;
  const max = rows[0].count || 1;
  return (
    <div className="ad-rows">
      {rows.map((r) => (
        <div className="ad-row" key={r.key}>
          <div className="ad-row-line">
            <span title={label(r.key)}>{label(r.key)}</span>
            <span>
              {nf.format(r.count)} · {Math.round((r.count / total) * 100)}%
            </span>
          </div>
          <div className="ad-bar">
            <div style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// One number with its unit, what it counts and the period it covers, so no two cards look like the same thing.
const Stat = ({ title, value, unit, what, period, allTime }: { title: string; value: number | string; unit: string; what: string; period: string; allTime?: boolean }) => (
  <div className="ad-card ad-stat">
    <div className="ad-stat-top">
      <small>{title}</small>
      <em className={allTime ? "all" : ""}>{period}</em>
    </div>
    <b>
      {typeof value === "number" ? nf.format(value) : value} <i>{unit}</i>
    </b>
    <span>{what}</span>
  </div>
);

function Dashboard({ pass, onLogout }: { pass: string; onLogout: () => void }) {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchStats(pass, days)
      .then(setStats)
      .catch((e: Error) => {
        setError(e.message);
        if (e.message === "Sai mật khẩu.") onLogout();
      })
      .finally(() => setLoading(false));
    fetchReleases().then(setReleases).catch(() => setReleases(null));
  }, [pass, days, onLogout]);
  useEffect(load, [load]);

  const ghTotal = useMemo(() => (releases ?? []).reduce((a, r) => a + r.setup + r.full, 0), [releases]);

  return (
    <>
      <div className="ad-top">
        <div className="ad-top-in">
          <div className="ad-brand">
            <img src="./logo.png" alt="" />
            Cocoflow <span>Admin</span>
          </div>
          <div className="ad-tools">
            <Segmented
              value={days}
              onChange={(v) => setDays(Number(v))}
              options={[
                { label: "7 ngày", value: 7 },
                { label: "30 ngày", value: 30 },
                { label: "90 ngày", value: 90 },
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
              Làm mới
            </Button>
            <Button icon={<LogoutOutlined />} onClick={onLogout}>
              Thoát
            </Button>
          </div>
        </div>
      </div>

      <div className="ad-main">
        {error && <Alert type="error" showIcon message={error} />}
        {!stats && loading && <Spin style={{ margin: "60px auto" }} />}
        {stats && (
          <>
            <div className="ad-groups">
              <section className="ad-group">
                <h2>Người xem trang web</h2>
                <div className="ad-cards">
                  <Stat title="Lượt xem trang" value={stats.totals.views} unit="lượt" what="Số lần trang chủ được mở." period={`${stats.days} ngày qua`} />
                  <Stat title="Số khách" value={stats.totals.visitors} unit="người" what="Mỗi người tính 1 lần mỗi ngày, rồi cộng các ngày lại." period={`${stats.days} ngày qua`} />
                </div>
              </section>
              <section className="ad-group">
                <h2>Tải ứng dụng</h2>
                <div className="ad-cards">
                  <Stat
                    title="Bấm nút Tải trên web"
                    value={stats.totals.clicks}
                    unit="lần"
                    what={`Người xem bấm nút Tải về trên trang này${stats.totals.visitors ? ` (${Math.round((stats.totals.clicks / stats.totals.visitors) * 100)}% số khách)` : ""}.`}
                    period={`${stats.days} ngày qua`}
                  />
                  <Stat
                    title="File cài đặt đã tải"
                    value={releases ? ghTotal : "—"}
                    unit="lượt"
                    what="Do GitHub đếm, gồm cả tải qua trang web lẫn link gửi trực tiếp."
                    period="Từ trước đến nay"
                    allTime
                  />
                </div>
              </section>
            </div>

            <div className="ad-card">
              <div className="ad-chart-head">
                <h3>Lượt xem mỗi ngày</h3>
              </div>
              <Bars series={stats.series} pick={(d) => ({ back: d.views, front: d.visitors })} tint="#3f6df6" />
              <div className="ad-legend">
                <span><i style={{ background: "#3f6df6", opacity: 0.28 }} />Lượt xem</span>
                <span><i style={{ background: "#3f6df6" }} />Khách truy cập</span>
              </div>
            </div>

            <div className="ad-card">
              <div className="ad-chart-head">
                <h3>Lượt bấm nút Tải mỗi ngày</h3>
              </div>
              <Bars series={stats.series} pick={(d) => ({ front: d.downloads })} tint="#0ea5a4" />
              <div className="ad-legend">
                <span>Bản tiêu chuẩn: {nf.format(stats.series.reduce((a, d) => a + d.setup, 0))}</span>
                <span>Bản đầy đủ: {nf.format(stats.series.reduce((a, d) => a + d.full, 0))}</span>
              </div>
            </div>

            <div className="ad-grid">
              <div className="ad-card">
                <h3>Quốc gia</h3>
                <Rows rows={stats.countries} label={countryName} />
              </div>
              <div className="ad-card">
                <h3>Nguồn truy cập</h3>
                <Rows rows={stats.referrers} label={refName} />
              </div>
              <div className="ad-card">
                <h3>Thiết bị</h3>
                <Rows rows={stats.devices} label={deviceName} />
              </div>
            </div>

            <div className="ad-card">
              <h3>Lượt tải từng bản phát hành (GitHub)</h3>
              {!releases ? (
                <div className="ad-empty">Chưa lấy được dữ liệu từ GitHub (có thể đang bị giới hạn lượt gọi, thử lại sau).</div>
              ) : !releases.length ? (
                <div className="ad-empty">Chưa có bản phát hành nào.</div>
              ) : (
                <table className="ad-table">
                  <thead>
                    <tr>
                      <th>Phiên bản</th>
                      <th>Ngày</th>
                      <th>Tiêu chuẩn</th>
                      <th>Đầy đủ</th>
                      <th>Tổng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {releases.map((r) => (
                      <tr key={r.tag}>
                        <td>{r.tag}</td>
                        <td>{r.date}</td>
                        <td>{nf.format(r.setup)}</td>
                        <td>{nf.format(r.full)}</td>
                        <td>{nf.format(r.setup + r.full)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default function Admin() {
  const [pass, setPass] = useState<string>(() => {
    try {
      return sessionStorage.getItem(KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setPass("");
  }, []);

  const login = async () => {
    setBusy(true);
    setError("");
    try {
      await fetchStats(draft, 7); // checks the password on the server before showing anything
      try {
        sessionStorage.setItem(KEY, draft);
      } catch {
        /* the key then lives in memory only */
      }
      setPass(draft);
      setDraft("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (pass) return <Dashboard pass={pass} onLogout={logout} />;
  return (
    <div className="ad-login">
      <form
        className="ad-login-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft && !busy) void login();
        }}
      >
        <div className="ad-brand">
          <img src="./logo.png" alt="" />
          Cocoflow <span>Admin</span>
        </div>
        <Input.Password autoFocus size="large" placeholder="Mật khẩu quản trị" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="current-password" />
        {error && <Alert type="error" showIcon message={error} />}
        <Button type="primary" size="large" htmlType="submit" loading={busy} disabled={!draft}>
          Đăng nhập
        </Button>
      </form>
    </div>
  );
}
