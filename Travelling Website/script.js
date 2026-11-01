const sections = document.querySelectorAll(".destination");

window.addEventListener("scroll", () => {

sections.forEach(section => {

const rect = section.getBoundingClientRect();

if(rect.top < window.innerHeight && rect.bottom > 0){

const img = section.querySelector(".dest-img");

img.style.transform = "scale(1.15)";

}

});

});
const footer = document.querySelector(".newsletter");

window.addEventListener("scroll", () => {

const rect = footer.getBoundingClientRect();

if(rect.top < window.innerHeight - 100){
footer.classList.add("show");
}

});