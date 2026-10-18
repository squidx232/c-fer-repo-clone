#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdlib.h>
/* Relocate the open-source X server's keyboard compiler; no vendor code changes. */
__attribute__((constructor)) static void relocate_xkb(void) {
    char **directory = (char **)dlsym(RTLD_DEFAULT, "XkbBinDirectory");
    char *local = getenv("LOCAL_XKB_BIN");
    if (directory && local && local[0] == '/') *directory = local;
}
