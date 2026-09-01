import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>A CRM that lives inside Shopify admin</h1>
        <p className={styles.text}>
          Open a customer and see the whole relationship in one sorted feed:
          orders, the calls and emails your team logged, and lifecycle events.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>One timeline per customer</strong>. Orders, interactions,
            and lifecycle events merged and sorted, derived fresh on every read.
          </li>
          <li>
            <strong>Filled or hollow</strong>. Filled markers are what Shopify
            already knows. Hollow markers are what only this app knows.
          </li>
          <li>
            <strong>A demo, not a product</strong>. Its data is entirely fake
            and local, and it is not wired to any real store.
          </li>
        </ul>
      </div>
    </div>
  );
}
