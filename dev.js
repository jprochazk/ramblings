import http from "http-server";
import { WebSocketServer } from "ws";
import watch from "node-watch";

const server = http.createServer({ root: "./public" });
server.listen(8000);

const wss = new WebSocketServer({ port: 8001 });

const clients = new Set();
wss.on("connection", (conn) => {
  clients.add(conn);
  conn.on("close", () => clients.delete(conn));
});

const event = JSON.stringify({ type: "refresh" });
const onChange = () => {
  // TODO: rebuild
  clients.forEach((conn) => conn.send(event));
};

watch("./public", { recursive: true }, onChange);
watch("./template.html", onChange);
