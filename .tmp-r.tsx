import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync } from "node:fs";
import { ClassroomScene } from "@/app/components/illustrations";
const css = `.cr-window{opacity:.6}`;
const svg = renderToStaticMarkup(<ClassroomScene />).replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="800" `).replace(/<defs>/, `<defs><style>${css}</style>`);
writeFileSync(process.argv[2], svg);
