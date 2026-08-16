// src/index.ts
var app = new Hono2();
app.use(
    "*",
    cors({
        origin: /* @__PURE__ */ __name((origin) => {
            if (!origin) return "null";
            if (origin.startsWith("http://localhost")) return origin;
            if (origin.startsWith("http://127.0.0.1")) return origin;
            if (origin.startsWith("http://192.168.")) return origin;
            if (origin.endsWith(".local:5173")) return origin;
            if (origin === "https://shopping-list2.pages.dev") return origin;
            return "null";
        }, "origin"),
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        credentials: true
    })
);
app.get("/message", (c) => {
    return c.json({ message: "Hello Hono!" });
});
app.post("/update-product", async (c) => {
    const form = await c.req.formData();
    const name = form.get("name");
    const price = form.get("price");
    const category = form.get("category");
    const store = form.get("store");
    const description = form.get("description");
    const barcode = form.get("barcode");
    const image = form.get("image");
    const item = await c.env.shopping_list.prepare("SELECT * FROM products WHERE barcode = ? ").bind(barcode).first();
    const supabase = createClient(
        c.env.SUPABASE_URL,
        c.env.SUPABASE_SERVICE_KEY
    );
    const ext = image?.name.split(".").pop() || "jpg";
    const fileName = `${name}-${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const imageUrl = "https://isdtokzfuppyibdyevtu.supabase.co/storage/v1/object/public/white-stone-userimg/" + fileName;
    if (item) {
        const req = await c.env.shopping_list.prepare("UPDATE products SET name = ?, price = ?, category = ?, description = ? WHERE barcode = ?").bind(name, price, category, description, barcode).run();
        if (image) {
            const oldUrl = item.image_url;
            const oldFileName = oldUrl.split("/").pop();
            const { error } = await supabase.storage.from(c.env.SUPABASE_BUCKET).upload(oldFileName, image, {
                contentType: `image/${ext}`,
                upsert: true
            });
            if (error) {
                return c.json({ ok: false, message: "IMAGE_UPLOAD_FAILED", error });
            }
        }
        return c.json({ ok: true, message: "ITEM_UPDATED" });
    }
    try {
        await c.env.shopping_list.prepare("INSERT INTO products(name, price, category, store, description, barcode, image_url)VALUES ( ?, ?, ?, ?, ?, ?, ?)").bind(name, price, category, store, description, barcode, imageUrl).run();
        if (image) {
            const { data, error } = await supabase.storage.from(c.env.SUPABASE_BUCKET).upload(fileName, image, {
                contentType: `image/${ext}`
            });
        }
        return c.json({ ok: true, message: "Product added to the global list." }, 200);
    } catch (err) {
        console.log(err);
        return c.json({ ok: false, message: "Something went wrong" }, 500);
    }
});
app.get("/get-products", async (c) => {
    try {
        const products = await c.env.shopping_list.prepare("SELECT * FROM products").run();
        return c.json({ ok: true, list: products });
    } catch (err) {
        console.log(err);
        return c.json({ ok: false }, 500);
    }
});
app.post("/newacc", async (c) => {
    const user = await c.req.json();
    const { email, first_name, last_name, password } = user;
    const passwordHash = await bcryptjs_default.hash(password, 10);
    try {
        await c.env.shopping_list.prepare("INSERT INTO users(email, first_name, last_name, password_hash)VALUES ( ?, ?, ?, ? )").bind(email, first_name, last_name, passwordHash).run();
        return c.json({ ok: true, message: "Account successfully created!" });
    } catch (err) {
        console.log(err);
        const message = String(err);
        if (message.includes("UNIQUE constraint failed")) {
            return c.json({ ok: false, error: "USER_EXISTS" });
        }
        return c.json({ ok: false, error: err });
    }
});
app.post("/login", async (c) => {
    const user = await c.req.json();
    const { email, password } = user;
    try {
        const selectedUser = await c.env.shopping_list.prepare("SELECT id, email, first_name, last_name, password_hash FROM users WHERE email = ?").bind(email).first();
        if (!selectedUser) {
            return c.json({ ok: false, error: "USER_NOT_EXIST" }, 404);
        }
        const isValid = await bcryptjs_default.compare(password, selectedUser.password_hash);
        if (!isValid) {
            return c.json({ ok: false, error: "INVALID_PASSWORD" }, 401);
        }
        const token = selectedUser.first_name;
        return c.json({ ok: true, user: selectedUser, token });
    } catch (err) {
        console.log(err);
        return c.json({ ok: false, error: "UNKNOWN_ERROR" }, 500);
    }
});
app.post("/my-list", async (c) => {
    const userId = await c.req.json();
    const myList = await c.env.shopping_list.prepare("SELECT list FROM user_list WHERE user_id = ?").bind(userId).first();
    if (!myList) return c.json({ ok: false, message: "LIST_NOT_EXISTS" }, 404);
    return c.json({ ok: true, data: myList }, 200);
});
app.post("update-list", async (c) => {
    const { user_id, list } = await c.req.json();
    const listString = JSON.stringify(list);
    const myList = await c.env.shopping_list.prepare("SELECT list FROM user_list WHERE user_id = ?").bind(user_id).first();
    try {
        if (myList) {
            await c.env.shopping_list.prepare("UPDATE user_list SET list = ? WHERE user_id = ?").bind(listString, user_id).run();
            return c.json({ ok: true, message: "LIST_UPDATED" }, 200);
        }
        await c.env.shopping_list.prepare("INSERT INTO user_list ( user_id, list ) VALUES( ?, ? )").bind(user_id, listString).run();
        return c.json({ ok: true, message: "LIST_CREATED" }, 200);
    } catch (error) {
        console.log(error);
        return c.json({ ok: false, message: "SERVER_ERROR", error }, 500);
    }
});
app.get("getstores", async (c) => {
    try {
        const stores = await c.env.shopping_list.prepare("SELECT DISTINCT store FROM products").run();
        if (!stores) return c.json({ ok: false, error: "NO_STORE" }, 404);
        return c.json({ ok: true, stores: stores.results }, 200);
    } catch (error) {
        return c.json({ ok: false, error }, 500);
    }
});
app.post("/get-my-list-items", async (c) => {
    const body = await c.req.json();
    const { idList, currentStore } = body;
    try {
        if (!idList || idList.length === 0) return c.json({ ok: true, data: [] });
        let querry;
        let params = [...idList];
        const placeholders = idList.map(() => "?").join(", ");
        if (!currentStore || currentStore === "all") {
            querry = `SELECT * FROM products WHERE id IN (${placeholders})`;
        } else {
            querry = `SELECT * FROM products WHERE id IN (${placeholders}) AND store = ?`;
            params.push(currentStore);
        }
        const row = await c.env.shopping_list.prepare(querry).bind(...params).run();
        const myList = row.results;
        if (!myList) return c.json({ ok: false, message: "Product does not exist" }, 404);
        return c.json({ ok: true, data: myList }, 200);
    } catch (error) {
        console.log(error);
        return c.json({ ok: false, error, message: "Something went wrong." }, 500);
    }
});
app.post("/getitembybarcode", async (c) => {
    const barcode = await c.req.text();
    console.log(barcode);
    try {
        const item = await c.env.shopping_list.prepare("SELECT * FROM products WHERE barcode = ? ").bind(barcode).first();
        if (!item) {
            return c.json({ ok: true, message: "NO_ITEM_FOUND" }, 404);
        }
        return c.json({ ok: true, message: "ITEM_FOUND", item }, 200);
    } catch (error) {
        console.log(error);
        return c.json({ ok: false, message: "INTERNAL_SERVER_ERROR", error }, 500);
    }
});
var index_default = app;
export {
    index_default as default
};
//# sourceMappingURL=index.js.map