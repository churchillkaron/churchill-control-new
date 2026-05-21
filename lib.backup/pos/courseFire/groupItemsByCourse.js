export function groupItemsByCourse(
  items = []
) {

  const courses = {}

  items.forEach(item => {

    const course =
      item.course ||
      'MAIN'

    if (
      !courses[course]
    ) {

      courses[course] = []
    }

    courses[course].push(item)
  })

  return courses
}
