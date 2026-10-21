import type { ReactNode } from "react";
import { Col, Row, Typography } from "antd";
import { CheckCircleFilled } from "@ant-design/icons";
import { useT } from "./lang";

const { Title, Paragraph } = Typography;

/** Text and a few key points on one side, a real screenshot of the app on the other. */
export function Feature({ eyebrow, title, body, points, flip, children }: { eyebrow: string; title: string; body: ReactNode; points?: ReactNode[]; flip?: boolean; children: ReactNode }) {
  return (
    <Row gutter={[64, 32]} align="middle" className="feature" style={{ flexDirection: flip ? "row-reverse" : undefined }}>
      <Col xs={24} md={10}>
        <div className="eyebrow">{eyebrow}</div>
        <Title level={2} style={{ marginTop: 8 }}>{title}</Title>
        <Paragraph className="lead">{body}</Paragraph>
        {points && (
          <ul className="feature-points">
            {points.map((p, i) => (
              <li key={i}><CheckCircleFilled /><span>{p}</span></li>
            ))}
          </ul>
        )}
      </Col>
      <Col xs={24} md={14}>{children}</Col>
    </Row>
  );
}

/** Screenshot taken from the real app (see website/public/shots), in the site's current language. */
export function Shot({ name, alt, narrow, tags }: { name: string; alt: string; narrow?: boolean; tags?: string[] }) {
  const { lang } = useT();
  return (
    <div className={`shot-stage${narrow ? " narrow" : ""}`}>
      <figure className="shot">
        <img src={`./shots/${name}-${lang}.png`} alt={alt} loading="lazy" />
      </figure>
      {tags && (
        <div className="shot-tags">
          {tags.map((tag) => <span key={tag} className="shot-tag"><i />{tag}</span>)}
        </div>
      )}
    </div>
  );
}

export function NewTag() {
  const { t } = useT();
  return <span className="newtag">{t("Mới", "New")}</span>;
}
