#ifndef MONITOR_HTTP_SERVER_HPP
#define MONITOR_HTTP_SERVER_HPP

#include "monitor/sqlite_store.hpp"

class HttpServer {
public:
    HttpServer(SqliteStore& store, int port);
    int run();

private:
    SqliteStore& store_;
    int port_;
    void handleClient(int client_fd);
};

#endif
