/* Resolve AAO SPA links from /pages/* so header/footer work on file:// and http:// */
(function () {
  var spa = new URL("../AAO_Website_hallmark.html", location.href).href.split("#")[0];
  document.querySelectorAll("a[data-spa]").forEach(function (a) {
    var hash = a.getAttribute("data-spa") || "#home";
    if (hash.charAt(0) !== "#") hash = "#" + hash;
    a.setAttribute("href", spa + hash);
  });
})();
