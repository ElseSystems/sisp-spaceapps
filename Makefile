CC := clang
CXX := clang++
BUILD_DIR := build
TARGET := $(BUILD_DIR)/monitoramento-dashboard
DEMO_TARGET := $(BUILD_DIR)/monitoramento-demo
CPPFLAGS := -Iinclude
CFLAGS := -std=c11 -Wall -Wextra -Wpedantic -O2
CXXFLAGS := -std=c++17 -Wall -Wextra -Wpedantic -O2
LDLIBS := -lsqlite3

C_OBJECTS := $(BUILD_DIR)/ram_table.o
CPP_OBJECTS := $(BUILD_DIR)/sqlite_store.o

.PHONY: all dashboard run run-demo clean info

all: dashboard

dashboard: $(TARGET)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

runtime:
	mkdir -p runtime

$(BUILD_DIR)/ram_table.o: src/ram_table.c include/monitor/ram_table.h include/monitor/health_data.h | $(BUILD_DIR)
	$(CC) $(CPPFLAGS) $(CFLAGS) -c $< -o $@

$(BUILD_DIR)/sqlite_store.o: src/sqlite_store.cpp include/monitor/sqlite_store.hpp include/monitor/health_data.h | $(BUILD_DIR)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR)/main.o: src/main.cpp include/monitor/ram_table.h include/monitor/sqlite_store.hpp | $(BUILD_DIR)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR)/server_main.o: src/server_main.cpp include/monitor/http_server.hpp include/monitor/sqlite_store.hpp | $(BUILD_DIR)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR)/http_server.o: src/http_server.cpp include/monitor/http_server.hpp include/monitor/sqlite_store.hpp | $(BUILD_DIR)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -c $< -o $@

$(TARGET): $(C_OBJECTS) $(CPP_OBJECTS) $(BUILD_DIR)/http_server.o $(BUILD_DIR)/server_main.o | runtime
	$(CXX) $^ $(LDLIBS) -o $@

$(DEMO_TARGET): $(C_OBJECTS) $(CPP_OBJECTS) $(BUILD_DIR)/main.o | runtime
	$(CXX) $^ $(LDLIBS) -o $@

run: $(TARGET)
	./$(TARGET)

run-demo: $(DEMO_TARGET)
	./$(DEMO_TARGET)

info:
	@clang --version | head -n 1
	@sqlite3 --version

clean:
	rm -rf $(BUILD_DIR)
