// Runs the production Lua scripts in a real Lua VM with a minimal redis.call, so tests exercise the scripts themselves.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari") as {
  lua: Record<string, (...args: unknown[]) => unknown> & Record<string, number>;
  lauxlib: Record<string, (...args: unknown[]) => unknown>;
  lualib: { luaL_openlibs: (L: unknown) => void };
  to_luastring: (value: string) => Uint8Array;
  to_jsstring: (value: Uint8Array) => string;
};

export type RedisStrings = Map<string, string>;

function pushTable(L: unknown, values: string[]): void {
  lua.lua_createtable!(L, values.length, 0);
  values.forEach((value, index) => {
    lua.lua_pushstring!(L, to_luastring(value));
    lua.lua_rawseti!(L, -2, index + 1);
  });
}

function command(store: RedisStrings, args: string[]): string | number | null {
  const [name, key = "", value = ""] = args;
  switch (name!.toUpperCase()) {
    case "GET":
      return store.get(key) ?? null;
    case "SET":
      store.set(key, value);
      return "OK";
    case "EXISTS":
      return store.has(key) ? 1 : 0;
    case "INCRBY": {
      const next = Number(store.get(key) ?? "0") + Number(value);
      if (!Number.isInteger(next)) throw new Error("not an integer");
      store.set(key, String(next));
      return next;
    }
    case "INCRBYFLOAT": {
      const next = Number(store.get(key) ?? "0") + Number(value);
      store.set(key, String(next));
      return String(next);
    }
    default:
      throw new Error(`unsupported ${name}`);
  }
}

/** EVAL in one step, as Redis does. Returns the script's integer reply. */
export function evalLua(store: RedisStrings, script: string, keys: string[], argv: Array<string | number>): number {
  const L = lauxlib.luaL_newstate!();
  lualib.luaL_openlibs(L);
  lua.lua_createtable!(L, 0, 1);
  lua.lua_pushcfunction!(L, (state: unknown) => {
    const count = lua.lua_gettop!(state) as number;
    const args: string[] = [];
    for (let i = 1; i <= count; i += 1) args.push(to_jsstring(lauxlib.luaL_tolstring!(state, i) as Uint8Array));
    lua.lua_settop!(state, count);
    const reply = command(store, args);
    if (reply === null) lua.lua_pushboolean!(state, false);
    else if (typeof reply === "number") lua.lua_pushinteger!(state, reply);
    else lua.lua_pushstring!(state, to_luastring(reply));
    return 1;
  });
  lua.lua_setfield!(L, -2, to_luastring("call"));
  lua.lua_setglobal!(L, to_luastring("redis"));
  pushTable(L, keys);
  lua.lua_setglobal!(L, to_luastring("KEYS"));
  pushTable(L, argv.map(String));
  lua.lua_setglobal!(L, to_luastring("ARGV"));
  if (lauxlib.luaL_loadstring!(L, to_luastring(script)) !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring!(L, -1) as Uint8Array));
  if (lua.lua_pcall!(L, 0, 1, 0) !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring!(L, -1) as Uint8Array));
  return Number(lua.lua_tonumber!(L, -1));
}
