import { redirect } from "next/navigation";

// "Für dich" heißt jetzt "Filmfinder" und ist die Startseite.
export default function ForYouRedirect() {
  redirect("/");
}
