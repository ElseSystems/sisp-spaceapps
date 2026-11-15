#include "monitor/http_server.hpp"

#include <arpa/inet.h>
#include <csignal>
#include <fstream>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>
#include <netinet/in.h>

namespace {

std::string urlDecode(const std::string& input) {
    std::string output;
    output.reserve(input.size());
    for (size_t i = 0; i < input.size(); ++i) {
        if (input[i] == '+' ) {
            output.push_back(' ');
        } else if (input[i] == '%' && i + 2u < input.size()) {
            try {
                output.push_back(static_cast<char>(std::stoi(input.substr(i + 1u, 2u), nullptr, 16)));
                i += 2u;
            } catch (...) {
                output.push_back(input[i]);
            }
        } else {
            output.push_back(input[i]);
        }
    }
    return output;
}

std::map<std::string, std::string> parseQuery(const std::string& raw) {
    std::map<std::string, std::string> query;
    size_t start = 0;
    while (start <= raw.size()) {
        const size_t end = raw.find('&', start);
        const std::string part = raw.substr(start, end == std::string::npos ? std::string::npos : end - start);
        const size_t equal = part.find('=');
        if (equal != std::string::npos) {
            query[urlDecode(part.substr(0, equal))] = urlDecode(part.substr(equal + 1u));
        }
        if (end == std::string::npos) break;
        start = end + 1u;
    }
    return query;
}

std::string readFile(const std::string& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file) return {};
    std::ostringstream contents;
    contents << file.rdbuf();
    return contents.str();
}

bool sendAll(int fd, const std::string& data) {
    size_t sent = 0;
    while (sent < data.size()) {
        const ssize_t count = send(fd, data.data() + sent, data.size() - sent, 0);
        if (count <= 0) return false;
        sent += static_cast<size_t>(count);
    }
    return true;
}

void respond(int client, int status, const std::string& content_type, const std::string& body) {
    const char* status_text = status == 200 ? "OK" : status == 400 ? "Bad Request" : status == 404 ? "Not Found" : "Internal Server Error";
    std::ostringstream headers;
    headers << "HTTP/1.1 " << status << ' ' << status_text << "\r\n"
            << "Content-Type: " << content_type << "\r\n"
            << "Content-Length: " << body.size() << "\r\n"
            << "Cache-Control: no-store\r\n"
            << "X-Content-Type-Options: nosniff\r\n"
            << "Connection: close\r\n\r\n";
    sendAll(client, headers.str() + body);
}

} // namespace

HttpServer::HttpServer(SqliteStore& store, int port) : store_(store), port_(port) {}

int HttpServer::run() {
    std::signal(SIGPIPE, SIG_IGN);
    const int server = socket(AF_INET, SOCK_STREAM, 0);
    if (server < 0) {
        std::cerr << "Não foi possível criar o socket HTTP.\n";
        return 1;
    }
    int reuse = 1;
    setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));

    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK); // A API fica acessível apenas nesta máquina.
    address.sin_port = htons(static_cast<uint16_t>(port_));
    if (bind(server, reinterpret_cast<sockaddr*>(&address), sizeof(address)) < 0 || listen(server, 16) < 0) {
        std::cerr << "Não foi possível escutar em 127.0.0.1:" << port_ << ". A porta pode estar ocupada.\n";
        close(server);
        return 1;
    }

    std::cout << "Painel NASA disponível em http://127.0.0.1:" << port_ << "/ (Ctrl+C para encerrar)\n" << std::flush;
    while (true) {
        const int client = accept(server, nullptr, nullptr);
        if (client < 0) continue;
        handleClient(client);
        close(client);
    }
}

void HttpServer::handleClient(int client_fd) {
    // Uma conexão que abre o socket, mas não envia a requisição, não pode
    // bloquear o servidor serial e impedir que a interface carregue.
    timeval io_timeout{};
    io_timeout.tv_sec = 3;
    setsockopt(client_fd, SOL_SOCKET, SO_RCVTIMEO, &io_timeout, sizeof(io_timeout));
    io_timeout.tv_sec = 5;
    setsockopt(client_fd, SOL_SOCKET, SO_SNDTIMEO, &io_timeout, sizeof(io_timeout));
    char buffer[8192]{};
    const ssize_t received = recv(client_fd, buffer, sizeof(buffer) - 1u, 0);
    if (received <= 0) return;
    const std::string request(buffer, static_cast<size_t>(received));
    const size_t first_space = request.find(' ');
    const size_t second_space = first_space == std::string::npos ? std::string::npos : request.find(' ', first_space + 1u);
    if (first_space == std::string::npos || second_space == std::string::npos) {
        respond(client_fd, 400, "application/json; charset=utf-8", "{\"error\":\"Requisição inválida\"}");
        return;
    }
    const std::string method = request.substr(0, first_space);
    std::string target = request.substr(first_space + 1u, second_space - first_space - 1u);
    if (method != "GET") {
        respond(client_fd, 400, "application/json; charset=utf-8", "{\"error\":\"Apenas GET é suportado\"}");
        return;
    }
    const size_t question = target.find('?');
    const std::string path = target.substr(0, question);
    const auto query = question == std::string::npos ? std::map<std::string, std::string>{} : parseQuery(target.substr(question + 1u));

    if (path == "/api/health") {
        respond(client_fd, 200, "application/json; charset=utf-8", "{\"status\":\"ok\",\"source\":\"NASA OSDR OSD-569\"}");
    } else if (path == "/api/studies") {
        respond(client_fd, 200, "application/json; charset=utf-8", store_.nasaStudiesJson());
    } else if (path == "/api/study-summary") {
        const auto study = query.find("id");
        if (study == query.end()) respond(client_fd, 400, "application/json; charset=utf-8", "{\"error\":\"Informe id do estudo\"}");
        else respond(client_fd, 200, "application/json; charset=utf-8", store_.nasaStudySummaryJson(study->second));
    } else if (path == "/api/genes") {
        const auto study = query.find("study");
        const auto gene_query = query.find("q");
        if (study == query.end()) respond(client_fd, 400, "application/json; charset=utf-8", "{\"error\":\"Informe study\"}");
        else respond(client_fd, 200, "application/json; charset=utf-8", store_.nasaExpressionGenesJson(study->second, gene_query == query.end() ? "" : gene_query->second));
    } else if (path == "/api/expression") {
        const auto study = query.find("study");
        const auto gene = query.find("gene");
        if (study == query.end() || gene == query.end()) respond(client_fd, 400, "application/json; charset=utf-8", "{\"error\":\"Informe study e gene\"}");
        else respond(client_fd, 200, "application/json; charset=utf-8", store_.nasaExpressionSeriesJson(study->second, gene->second));
    } else if (path == "/api/summary") {
        respond(client_fd, 200, "application/json; charset=utf-8", store_.nasaCbcSummaryJson());
    } else if (path == "/api/subjects") {
        respond(client_fd, 200, "application/json; charset=utf-8", store_.nasaCbcSubjectsJson());
    } else if (path == "/api/markers") {
        respond(client_fd, 200, "application/json; charset=utf-8", store_.nasaCbcMarkersJson());
    } else if (path == "/api/series") {
        const auto subject = query.find("subject");
        const auto marker = query.find("marker");
        if (subject == query.end() || marker == query.end()) {
            respond(client_fd, 400, "application/json; charset=utf-8", "{\"error\":\"Informe subject e marker\"}");
        } else {
            respond(client_fd, 200, "application/json; charset=utf-8", store_.nasaCbcSeriesJson(subject->second, marker->second));
        }
    } else {
        std::string file;
        std::string content_type;
        if (path == "/" || path == "/index.html") { file = "web/index.html"; content_type = "text/html; charset=utf-8"; }
        else if (path == "/styles.css") { file = "web/styles.css"; content_type = "text/css; charset=utf-8"; }
        else if (path == "/sisp.css") { file = "web/sisp.css"; content_type = "text/css; charset=utf-8"; }
        else if (path == "/sisp-layout.css") { file = "web/sisp-layout.css"; content_type = "text/css; charset=utf-8"; }
        else if (path == "/crew.css") { file = "web/crew.css"; content_type = "text/css; charset=utf-8"; }
        else if (path == "/crew-layout.css") { file = "web/crew-layout.css"; content_type = "text/css; charset=utf-8"; }
        else if (path == "/dashboard-space.css") { file = "web/dashboard-space.css"; content_type = "text/css; charset=utf-8"; }
        else if (path == "/emergency.css") { file = "web/emergency.css"; content_type = "text/css; charset=utf-8"; }
        else if (path == "/assets/emergency-response.mp4") { file = "web/assets/emergency-response.mp4"; content_type = "video/mp4"; }
        else if (path == "/assets/emergency-alert-en-female.mp3") { file = "web/assets/emergency-alert-en-female.mp3"; content_type = "audio/mpeg"; }
        else if (path == "/assets/crew-1.png") { file = "web/assets/crew-1.png"; content_type = "image/png"; }
        else if (path == "/assets/crew-2.png") { file = "web/assets/crew-2.png"; content_type = "image/png"; }
        else if (path == "/assets/crew-3.png") { file = "web/assets/crew-3.png"; content_type = "image/png"; }
        else if (path == "/assets/crew-4.png") { file = "web/assets/crew-4.png"; content_type = "image/png"; }
        else if (path == "/app.js") { file = "web/app.js"; content_type = "application/javascript; charset=utf-8"; }
        else if (path == "/body3d.js") { file = "web/body3d.js"; content_type = "application/javascript; charset=utf-8"; }
        else if (path == "/checkin.js") { file = "web/checkin.js"; content_type = "application/javascript; charset=utf-8"; }
        else if (path == "/telemetry.js") { file = "web/telemetry.js"; content_type = "application/javascript; charset=utf-8"; }
        else if (path == "/crew.js") { file = "web/crew.js"; content_type = "application/javascript; charset=utf-8"; }
        else if (path == "/emergency.js") { file = "web/emergency.js"; content_type = "application/javascript; charset=utf-8"; }
        else if (path == "/medical.js") { file = "web/medical.js"; content_type = "application/javascript; charset=utf-8"; }
        else if (path == "/i18n.js") { file = "web/i18n.js"; content_type = "application/javascript; charset=utf-8"; }
        else if (path == "/locales/pt-BR.json") { file = "web/locales/pt-BR.json"; content_type = "application/json; charset=utf-8"; }
        else if (path == "/locales/en.json") { file = "web/locales/en.json"; content_type = "application/json; charset=utf-8"; }
        else if (path == "/api/human-cbc") { file = "dados/nasa_osdr/OSD-569/LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv"; content_type = "text/csv; charset=utf-8"; }
        else if (path == "/models/human-muscular.glb") { file = "web/models/human-muscular.glb"; content_type = "model/gltf-binary"; }
        else if (path == "/models/human-skeleton.glb") { file = "web/models/human-skeleton.glb"; content_type = "model/gltf-binary"; }
        else if (path == "/api/musculoskeletal-data") { file = "dados/nasa_osdr/OSD-654/LSDS-66_Bone_Biomechanical_DXA_tibia_TRANSFORMED.csv"; content_type = "text/csv; charset=utf-8"; }
        else if (path == "/api/lean-mass-data") { file = "dados/nasa_osdr/OSD-654/LSDS-66_lean_mass_pre_post.csv"; content_type = "text/csv; charset=utf-8"; }
        else if (path == "/api/muscle-force-data") { file = "dados/nasa_osdr/OSD-662/LSDS-75_Muscle Contractility_soleus_contractility_TRANSFORMED.csv"; content_type = "text/csv; charset=utf-8"; }
        else if (path == "/api/metabolic-data") { file = "dados/nasa_osdr/OSD-575/LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv"; content_type = "text/csv; charset=utf-8"; }
        else if (path == "/api/ax1-radiation-data") { file = "dados/nasa_radlab/Ax-1/iss_dostel_2022-04-09_2022-04-17.csv"; content_type = "text/csv; charset=utf-8"; }
        else { respond(client_fd, 404, "application/json; charset=utf-8", "{\"error\":\"Rota não encontrada\"}"); return; }
        const std::string body = readFile(file);
        if (body.empty()) respond(client_fd, 500, "text/plain; charset=utf-8", "Arquivo da interface não encontrado: " + file);
        else respond(client_fd, 200, content_type, body);
    }
}
