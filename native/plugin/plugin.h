// plugin.h — the CLAP plugin every instrument shares (plugin.cpp).
#pragma once

#include "forte/instrument.h"

namespace forte {

bool entryInit(const InstrumentInfo &info);
const void *entryFactory(const char *id);

} // namespace forte
